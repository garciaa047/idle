// tick.js — the ONE simulation code path for both online and offline.
//
// COMPOSABILITY INVARIANT (the important part): advance(N) must give
// approximately the same result as advance() called many times summing to N.
// This is what makes offline progress correct once mechanics become non-linear
// in later phases. We guarantee it by chunking time into fixed sub-steps and
// putting ALL production/consumption math in the single stepSimulation(dt).

import { MAX_STEP, MAX_SUBSTEPS } from './constants.js';
import { GENERATORS } from '../content/generators.js';
import { BASE_ENERGY_RATE } from './constants.js';

// The single place production/consumption math lives. dt is bounded (<= MAX_STEP).
function stepSimulation(state, dt) {
  // Passive trickle so the screen is alive from the first second.
  state.resources.energy += BASE_ENERGY_RATE * dt;

  // Generator output: iterate definitions generically — never hardcode generators.
  for (const gen of GENERATORS) {
    const owned = state.generators[gen.id] || 0;
    if (owned <= 0) continue;
    state.resources[gen.produces] += owned * gen.baseRate * dt;
  }
}

// Advance the simulation by `seconds` of game time, mutating `state`.
// Chunks into <= MAX_STEP sub-steps, with a bounded sub-step count so a huge
// input (e.g. weeks offline) can never freeze the UI: excess time is folded
// into one final larger step.
export function advance(state, seconds) {
  if (!(seconds > 0)) return;

  let remaining = seconds;
  let steps = 0;
  while (remaining > 0 && steps < MAX_SUBSTEPS) {
    const dt = Math.min(MAX_STEP, remaining);
    stepSimulation(state, dt);
    remaining -= dt;
    steps += 1;
  }
  // Fold any remainder (only reachable when seconds > MAX_SUBSTEPS * MAX_STEP)
  // into a single final step. Linear math makes this exact; non-linear later
  // mechanics accept the tiny approximation in exchange for a bounded UI cost.
  if (remaining > 0) {
    stepSimulation(state, remaining);
  }
}

// Compute current total per-second rate of a resource for display only.
// Pure read — never mutates state. Mirrors stepSimulation's contributions.
export function rateOf(state, resourceId) {
  let rate = 0;
  if (resourceId === 'energy') rate += BASE_ENERGY_RATE;
  for (const gen of GENERATORS) {
    if (gen.produces !== resourceId) continue;
    rate += (state.generators[gen.id] || 0) * gen.baseRate;
  }
  return rate;
}
