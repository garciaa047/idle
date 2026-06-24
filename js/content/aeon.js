// aeon.js — the Aeon (Æ) shop: permanent, GLOBAL, cross-Scale upgrades bought with
// Æ minted on Ascend. Because Ascend wipes σ, these must be immediately useful — a
// hard reset is a strict long-term GAIN. This is the minimal precursor to the
// branching Constants tree in Phase 6 (no mutually-exclusive nodes yet).
//
// Production upgrades expose `contributions(level)` so they stack through the SAME
// multiplier system as everything else (collectContributions reads them). The
// non-production ones (offline cap, automation) are read where they apply.

import {
  AEON_RESONANT_FACTOR, AEON_INSIGHT_FACTOR, TEMPORAL_RESERVOIR_STEP, T_CAP_BASE,
  AEON_RESONANT_COST, AEON_INSIGHT_COST, AEON_TEMPORAL_COST, AEON_AUTOMATION_COST,
} from '../engine/constants.js';

export const AEON_UPGRADES = [
  {
    id: 'resonantFoundation',
    name: 'Resonant Foundation',
    effectText: `×${AEON_RESONANT_FACTOR} all production / level`,
    cost: (level) => AEON_RESONANT_COST[0] * Math.pow(AEON_RESONANT_COST[1], level),
    // Applies in EVERY Scale via the shared 'all' multiplier target.
    contributions: (level) => [{ target: 'all', factor: Math.pow(AEON_RESONANT_FACTOR, level) }],
  },
  {
    id: 'singularInsight',
    name: 'Singular Insight',
    effectText: `σ gain ×${AEON_INSIGHT_FACTOR} / level`,
    cost: (level) => AEON_INSIGHT_COST[0] * Math.pow(AEON_INSIGHT_COST[1], level),
    contributions: (level) => [{ target: 'sigmaGain', factor: Math.pow(AEON_INSIGHT_FACTOR, level) }],
  },
  {
    id: 'temporalReservoir',
    name: 'Temporal Reservoir',
    effectText: `+${TEMPORAL_RESERVOIR_STEP / 3600}h offline cap / level`,
    cost: (level) => AEON_TEMPORAL_COST[0] * Math.pow(AEON_TEMPORAL_COST[1], level),
    // No production contribution — read by tCapOf() below.
  },
  {
    id: 'automationMatrix',
    name: 'Automation Matrix',
    effectText: `Lv1: "buy cheapest" mode + bigger auto-buy cap; further: faster cadence`,
    cost: (level) => AEON_AUTOMATION_COST[0] * Math.pow(AEON_AUTOMATION_COST[1], level),
    // No production contribution — read by the Automator (engine/automator.js).
  },
];

export const AEON_UPGRADE_BY_ID = Object.fromEntries(AEON_UPGRADES.map((u) => [u.id, u]));

export function aeonLevel(state, id) {
  return (state.aeonUpgrades && state.aeonUpgrades[id]) || 0;
}

// Derived offline cap (Phase 3): base + Temporal Reservoir. The saturating curve
// in offline.js consumes this; raising it visibly extends offline gains.
export function tCapOf(state) {
  return T_CAP_BASE + aeonLevel(state, 'temporalReservoir') * TEMPORAL_RESERVOIR_STEP;
}
