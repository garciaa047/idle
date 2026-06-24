// tick.js — the ONE simulation code path for both online and offline.
//
// COMPOSABILITY INVARIANT (the important part): advance(N) must give
// approximately the same result as advance() called many times summing to N.
// This is what keeps offline progress correct now that production is non-linear
// (input throttling) AND multi-link (the Phase 2 converter ladder). We guarantee
// it by chunking time into fixed sub-steps and putting ALL production/consumption
// math in the single stepSimulation(dt), computing every throttle PER SUB-STEP
// (never once over a whole offline gap), and processing converters bottom-to-top
// so each tier sees the freshly produced intermediate below it this same step.

import { MAX_STEP, MAX_SUBSTEPS } from './constants.js';
import { isActive, activeOutput } from '../content/generators.js';
import { generatorsOf, chainUnlocksOf } from '../content/scales.js';
import { collectContributions, multiplierFor, itemize } from './multipliers.js';

// The single place production/consumption math lives. dt is bounded (<= MAX_STEP).
function stepSimulation(state, dt) {
  const contribs = collectContributions(state);
  const mult = (target) => multiplierFor(contribs, target);
  const depth = state.unlockedDepth || 0;
  const ladder = generatorsOf(state); // the current Scale's generators (data-driven)

  // Pass 1 — pure PRODUCERS (no `consumes`) add output to stock first, so a
  // producer's same-sub-step output is available to consumers this step.
  for (const gen of ladder) {
    if (gen.consumes) continue;
    const owned = state.generators[gen.id] || 0;
    if (owned <= 0) continue;
    for (const res in gen.produces) {
      state.resources[res] += owned * gen.produces[res] * mult(res) * dt;
    }
  }

  // Pass 2 — CONVERTERS in ladder order (bottom -> top). Each is throttled by its
  // own input availability: efficiency = min(1, available/demand) drawn from the
  // CURRENT stock this sub-step. Outputs scale by efficiency; inputs consumed
  // proportionally. Bottom-to-top order means an upper tier already sees the
  // intermediate the tier below produced this step (multi-link throttling).
  for (const gen of ladder) {
    if (!gen.consumes) continue;
    if (!isActive(gen, depth)) continue; // inactive upper tiers do nothing yet
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
    // The output resource is dynamic (uniform rule): top active converter -> Structure.
    const { resource, rate } = activeOutput(gen, depth);
    const amount = owned * rate * mult(resource) * eff * dt;
    state.resources[resource] += amount;
    if (resource === 'structure') {
      state.structureThisCollapse += amount;     // resets on Collapse (prestige math)
      state.lifetimeStructure = (state.lifetimeStructure || 0) + amount; // NEVER resets (drives unlocks)
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

// --- Progressive deepening ---------------------------------------------------
// Increment unlockedDepth for every lifetimeStructure threshold now crossed, and
// return the list of newly-unlocked CHAIN_UNLOCKS entries (for notifications).
// Called after advance() (live + once after offline catch-up); the permanent
// ×TIER_UNLOCK_MULT follows unlockedDepth automatically (see multipliers.js).
export function checkUnlocks(state) {
  const unlocks = chainUnlocksOf(state);
  const newly = [];
  while ((state.unlockedDepth || 0) < unlocks.length) {
    const next = unlocks[state.unlockedDepth];
    if ((state.lifetimeStructure || 0) < next.threshold) break;
    state.unlockedDepth = next.depth;
    newly.push(next);
  }
  return newly;
}

// --- Display-only derived reads (pure; never mutate state) ------------------
//
// computeFlow is the single steady-state read the UI uses. It cascades the chain
// bottom-to-top: each producer's effective output becomes the supply for the
// converter above it, whose efficiency = supply/demand, and so on. This is a
// DISPLAY approximation (stock buffering can momentarily exceed it); the real
// per-sub-step throttle lives in stepSimulation above.
export function computeFlow(state, now = Date.now()) {
  const contribs = collectContributions(state, now);
  const depth = state.unlockedDepth || 0;
  const mult = (t) => multiplierFor(contribs, t);
  const supply = {};   // resourceId -> effective production rate available downstream
  const gens = {};     // genId -> { resource, rate (effective out), eff, owned }
  const ladder = generatorsOf(state);

  // Producers first — their output is the base supply.
  for (const gen of ladder) {
    if (gen.consumes) continue;
    const owned = state.generators[gen.id] || 0;
    const { resource, rate } = activeOutput(gen, depth);
    const out = owned * rate * mult(resource);
    gens[gen.id] = { resource, rate: out, eff: 1, owned };
    supply[resource] = (supply[resource] || 0) + out;
  }

  // Converters bottom-to-top so each reads the (already-computed) supply below it.
  for (const gen of ladder) {
    if (!gen.consumes) continue;
    const owned = state.generators[gen.id] || 0;
    const { resource, rate } = activeOutput(gen, depth);
    if (!isActive(gen, depth)) {
      gens[gen.id] = { resource, rate: 0, eff: 0, owned, inactive: true };
      continue;
    }
    let eff = 1;
    for (const res in gen.consumes) {
      const demand = owned * gen.consumes[res];
      if (demand > 0) eff = Math.min(eff, (supply[res] || 0) / demand);
    }
    eff = owned > 0 ? Math.max(0, Math.min(1, eff)) : 1;
    const out = owned * rate * mult(resource) * eff;
    gens[gen.id] = { resource, rate: out, eff, owned };
    supply[resource] = (supply[resource] || 0) + out;
  }

  return { gens, supply, mult, contribs };
}

// Effective per-second PRODUCTION rate of a resource for display (multiplier- and
// efficiency-aware). Mirrors Phase 1's gross-production semantics: consumption is
// shown on the consumer row, not subtracted here.
export function rateOf(state, resourceId, now = Date.now()) {
  return computeFlow(state, now).supply[resourceId] || 0;
}

// Effective output of one generator's current produced resource (for its row's
// "+X/s" readout). Reflects multipliers and that converter's own efficiency.
export function generatorOutput(state, gen, now = Date.now()) {
  const flow = computeFlow(state, now);
  const g = flow.gens[gen.id] || activeOutput(gen, state.unlockedDepth || 0);
  return { resource: g.resource, rate: g.rate || 0 };
}

// A single converter's steady-state efficiency (0..1) for its throttle indicator.
export function efficiencyOf(state, genId, now = Date.now()) {
  const g = computeFlow(state, now).gens[genId];
  return g ? g.eff : 1;
}

// Itemized production breakdown for a resource (the tap-to-expand tooltip): the
// pre-multiplier base, each multiplier source + factor, the binding efficiency,
// and the resulting rate. `flow` may be passed in to avoid recomputing.
export function breakdownFor(state, res, now = Date.now(), flow = null) {
  flow = flow || computeFlow(state, now);
  const depth = state.unlockedDepth || 0;
  let base = 0;
  let eff = 1;
  let throttled = false;
  for (const gen of generatorsOf(state)) {
    if (!isActive(gen, depth)) continue;
    const o = activeOutput(gen, depth);
    if (o.resource !== res) continue;
    const owned = state.generators[gen.id] || 0;
    if (owned <= 0) continue;
    base += owned * o.rate;
    if (gen.consumes) { throttled = true; eff = Math.min(eff, flow.gens[gen.id].eff); }
  }
  const items = itemize(flow.contribs, res);
  const m = flow.mult(res);
  return { base, items, eff, throttled, rate: base * m * eff };
}
