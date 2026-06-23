// prestige.js — Collapse (the within-Scale soft reset) + the Singularity (σ) shop.
//
// THE PRESTIGE DISTINCTION (keep this split clean — later phases nest more resets
// on top): a Collapse mints σ from cumulative Structure produced, then resets
// RUN-LEVEL state only (resources, generator counts, the cumulative counter, and
// active buffs) back to the fresh-Scale seed. σ and σ-upgrade levels (and settings)
// PERSIST. σ and what it buys carry over; everything below resets.

import { K_SIGMA, S_REF, SEED_STRUCTURE } from './constants.js';
import { RESOURCES } from '../content/resources.js';
import { GENERATORS } from '../content/generators.js';
import { UPGRADE_BY_ID } from '../content/upgrades.js';
import { collectContributions, multiplierFor } from './multipliers.js';

// σ = floor( K_SIGMA * sqrt(structureThisCollapse / S_REF) * collapseYieldBonus ).
// The √ makes prestige sublinear (doubling output does NOT double σ), so WHEN to
// Collapse is a real optimal-stopping decision. The Collapse Yield σ-upgrade feeds
// in via the 'sigmaGain' multiplier target (production 'all' never touches it).
export function sigmaGain(state, now = Date.now()) {
  const stc = state.structureThisCollapse || 0;
  if (stc <= 0) return 0;
  const base = K_SIGMA * Math.sqrt(stc / S_REF);
  const bonus = multiplierFor(collectContributions(state, now), 'sigmaGain');
  return Math.floor(base * bonus);
}

// Gated until structureThisCollapse >= S_REF (i.e. until it grants at least 1 σ).
export function canCollapse(state) {
  return (state.structureThisCollapse || 0) >= S_REF;
}

// Perform the Collapse: grant σ, then reset run-level state. Returns σ granted,
// or 0 if the gate wasn't met (caller should confirm first).
export function performCollapse(state, now = Date.now()) {
  if (!canCollapse(state)) return 0;
  const gain = sigmaGain(state, now);
  state.sigma = (state.sigma || 0) + gain;
  resetRun(state);
  return gain;
}

// Reset RUN-LEVEL state only. Used by Collapse (and reusable by Ascend in Phase 3).
// PERSISTS: state.sigma, state.sigmaUpgrades, state.settings, state.flags.
export function resetRun(state) {
  for (const r of RESOURCES) state.resources[r.id] = 0;
  state.resources.structure = SEED_STRUCTURE; // fresh-Scale bootstrap seed
  for (const g of GENERATORS) state.generators[g.id] = 0;
  state.structureThisCollapse = 0;
  state.overclockEndsAt = 0;        // active buffs do not survive a Collapse
  state.overclockCooldownEndsAt = 0;
}

// --- σ-shop ----------------------------------------------------------------

export function upgradeCost(up, level) {
  return up.cost(level);
}

export function buyUpgrade(state, upId) {
  const up = UPGRADE_BY_ID[upId];
  if (!up) return false;
  const level = (state.sigmaUpgrades[upId] || 0);
  const cost = up.cost(level);
  if ((state.sigma || 0) < cost) return false;
  state.sigma -= cost;
  state.sigmaUpgrades[upId] = level + 1;
  return true;
}
