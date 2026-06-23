// tick.js — the ONE simulation code path for both online and offline.
//
// COMPOSABILITY INVARIANT (the important part): advance(N) must give
// approximately the same result as advance() called many times summing to N.
// This is what keeps offline progress correct now that production is non-linear
// (input throttling). We guarantee it by chunking time into fixed sub-steps and
// putting ALL production/consumption math in the single stepSimulation(dt), and
// by computing the throttle PER SUB-STEP (never once over a whole offline gap).

import { MAX_STEP, MAX_SUBSTEPS } from './constants.js';
import { GENERATORS } from '../content/generators.js';
import { collectContributions, multiplierFor } from './multipliers.js';

// The single place production/consumption math lives. dt is bounded (<= MAX_STEP).
function stepSimulation(state, dt) {
  const contribs = collectContributions(state);
  const mult = (target) => multiplierFor(contribs, target);

  // Pass 1 — pure PRODUCERS (no `consumes`) add output to stock first, so a
  // producer's same-sub-step output is available to consumers this step.
  for (const gen of GENERATORS) {
    if (gen.consumes) continue;
    const owned = state.generators[gen.id] || 0;
    if (owned <= 0) continue;
    for (const res in gen.produces) {
      const amount = owned * gen.produces[res] * mult(res) * dt;
      state.resources[res] += amount;
      // Structure is the run score; track cumulative produced for Collapse.
      if (res === 'structure') state.structureThisCollapse += amount;
    }
  }

  // Pass 2 — CONSUMERS (have `consumes`) are throttled by input availability.
  // efficiency = min(1, available/demand) across every input, drawn from current
  // stock this sub-step. Outputs scale by efficiency; inputs consumed proportionally.
  for (const gen of GENERATORS) {
    if (!gen.consumes) continue;
    const owned = state.generators[gen.id] || 0;
    if (owned <= 0) continue;

    let eff = 1;
    for (const res in gen.consumes) {
      const demand = owned * gen.consumes[res] * dt;
      if (demand > 0) eff = Math.min(eff, (state.resources[res] || 0) / demand);
    }
    eff = Math.max(0, Math.min(1, eff));
    if (eff <= 0) continue;

    for (const res in gen.consumes) {
      state.resources[res] -= owned * gen.consumes[res] * dt * eff;
    }
    for (const res in gen.produces) {
      const amount = owned * gen.produces[res] * mult(res) * eff * dt;
      state.resources[res] += amount;
      if (res === 'structure') state.structureThisCollapse += amount;
    }
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
  if (remaining > 0) stepSimulation(state, remaining);
}

// --- Display-only derived reads (pure; never mutate state) ------------------

// Steady-state Fabricator efficiency (0..1): does producer output keep up with
// consumer demand? Stock buffering can momentarily run higher, but this is the
// balance lesson we surface in the UI. Generic over any consuming generator.
export function efficiencyOf(state, now = Date.now()) {
  const contribs = collectContributions(state, now);
  let worst = 1;
  let anyConsumer = false;

  for (const gen of GENERATORS) {
    if (!gen.consumes) continue;
    const owned = state.generators[gen.id] || 0;
    if (owned <= 0) continue;
    anyConsumer = true;
    for (const res in gen.consumes) {
      const demandRate = owned * gen.consumes[res];
      if (demandRate <= 0) continue;
      worst = Math.min(worst, productionRate(state, res, contribs) / demandRate);
    }
  }
  return anyConsumer ? Math.max(0, Math.min(1, worst)) : 1;
}

// Gross production rate of `res` from pure producers only (the supply available
// to consumers). Multiplier-aware.
function productionRate(state, res, contribs) {
  const m = multiplierFor(contribs, res);
  let rate = 0;
  for (const gen of GENERATORS) {
    if (gen.consumes) continue;
    const out = gen.produces[res];
    if (!out) continue;
    rate += (state.generators[gen.id] || 0) * out * m;
  }
  return rate;
}

// Effective per-second rate of a resource for display. Reflects multipliers, and
// for Structure (a consumer's output) reflects current efficiency.
export function rateOf(state, resourceId, now = Date.now()) {
  const contribs = collectContributions(state, now);
  const m = multiplierFor(contribs, resourceId);
  const eff = efficiencyOf(state, now);
  let rate = 0;
  for (const gen of GENERATORS) {
    const out = gen.produces && gen.produces[resourceId];
    if (!out) continue;
    let r = (state.generators[gen.id] || 0) * out * m;
    if (gen.consumes) r *= eff;
    rate += r;
  }
  return rate;
}

// Effective output of a single generator's primary produced resource (for the
// generator row "+X/s" readout). Consumers reflect efficiency.
export function generatorOutput(state, gen, now = Date.now()) {
  const contribs = collectContributions(state, now);
  const owned = state.generators[gen.id] || 0;
  const res = Object.keys(gen.produces)[0];
  let out = owned * gen.produces[res] * multiplierFor(contribs, res);
  if (gen.consumes) out *= efficiencyOf(state, now);
  return { resource: res, rate: out };
}
