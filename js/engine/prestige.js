// prestige.js — Collapse (the within-Scale soft reset) + the Singularity (σ) shop.
//
// THE PRESTIGE DISTINCTION (keep this split clean — Ascend nests ANOTHER reset on
// top in ascend.js): a Collapse mints σ from cumulative Structure produced, then
// resets RUN-LEVEL state only (resources, generator counts, the cumulative counter,
// active buffs) back to the fresh-Scale seed. σ, σ-upgrade levels, the unlocked
// chain depth, lifetimeStructure, Flux, and settings PERSIST across a Collapse.
//
// SCALE-AGNOSTIC: every definition (resources, ladder, σ params + upgrades) comes
// from the current Scale via scaleOf(state) — there is no per-Scale branching here.

import { SEED_STRUCTURE } from './constants.js';
import { scaleOf, resourcesOf, generatorsOf, upgradesOf } from '../content/scales.js';
import { collectContributions, multiplierFor } from './multipliers.js';

// σ = floor( K_SIGMA * sqrt(structureThisCollapse / S_REF) * sigmaGainBonus ).
// The √ makes prestige sublinear (doubling output does NOT double σ). The bonus
// folds in Collapse Yield (σ-shop) AND Singular Insight (Aeon shop) via 'sigmaGain'.
export function sigmaGain(state, now = Date.now()) {
  const stc = state.structureThisCollapse || 0;
  if (stc <= 0) return 0;
  const { K_SIGMA, S_REF } = scaleOf(state).sigma;
  const base = K_SIGMA * Math.sqrt(stc / S_REF);
  const bonus = multiplierFor(collectContributions(state, now), 'sigmaGain');
  return Math.floor(base * bonus);
}

// Gated until structureThisCollapse >= S_REF (i.e. until it grants at least 1 σ).
export function canCollapse(state) {
  return (state.structureThisCollapse || 0) >= scaleOf(state).sigma.S_REF;
}

// Perform the Collapse: grant σ (and credit sigmaThisScale, which feeds the Ascend
// Æ payout and is NEVER reduced by spending), then reset run-level state.
export function performCollapse(state, now = Date.now()) {
  if (!canCollapse(state)) return 0;
  const gain = sigmaGain(state, now);   // includes the Singularity Focus bonus if armed
  state.sigma = (state.sigma || 0) + gain;
  state.sigmaThisScale = (state.sigmaThisScale || 0) + gain; // cumulative earned this Scale
  state.singularityFocusArmed = false;  // the armed Flux bonus is consumed by this Collapse
  resetRun(state);
  return gain;
}

// Reset RUN-LEVEL state only. Used by Collapse (and reused by Ascend in ascend.js,
// which then additionally wipes the σ/chain/Scale-bound fields). Builds resources
// and generator slots from the CURRENT Scale's definitions.
// PERSISTS: sigma, sigmaUpgrades, sigmaThisScale, unlockedDepth, lifetimeStructure,
// flux, aeons, aeonUpgrades, settings, flags.
export function resetRun(state) {
  for (const r of resourcesOf(state)) state.resources[r.id] = 0;
  state.resources.structure = SEED_STRUCTURE; // fresh-Scale bootstrap seed
  for (const g of generatorsOf(state)) state.generators[g.id] = 0;
  state.structureThisCollapse = 0;
  state.overclockEndsAt = 0;        // active buffs do not survive a Collapse
  state.overclockCooldownEndsAt = 0;
  state.surgeEndsAt = 0;
  state.overdriveEndsAt = 0;
}

// --- σ-shop ----------------------------------------------------------------

export function upgradeCost(up, level) {
  return up.cost(level);
}

export function buyUpgrade(state, upId) {
  const up = upgradesOf(state).find((u) => u.id === upId);
  if (!up) return false;
  const level = (state.sigmaUpgrades[upId] || 0);
  const cost = up.cost(level);
  if ((state.sigma || 0) < cost) return false;
  state.sigma -= cost;
  state.sigmaUpgrades[upId] = level + 1;
  return true;
}
