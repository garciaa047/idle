// upgrades.js — σ-UPGRADE DEFINITIONS as data (never saved; levels live in
// state.sigmaUpgrades[id]). Bought with Singularity (σ); they PERSIST across
// Collapses. Every upgrade feeds the shared multiplier system (multipliers.js):
//
//   cost(level)          — σ price of the NEXT level (level = currently owned)
//   contributions(level) — list of { target, factor } the multiplier system stacks.
//                          `target` is a resource id, 'all', or 'sigmaGain'.
//   effectText           — short human description of the per-level effect.
//
// Adding an upgrade later = adding one object here; the engine never changes.

import {
  UP_FAB_YIELD_FACTOR, UP_THROUGHPUT_FACTOR, UP_RESONANCE_FACTOR, UP_COLLAPSE_YIELD_STEP,
  UP_FAB_YIELD_COST, UP_THROUGHPUT_COST, UP_RESONANCE_COST, UP_COLLAPSE_YIELD_COST,
} from '../engine/constants.js';

export const UPGRADES = [
  {
    id: 'fabricationYield',
    name: 'Fabrication Yield',
    effectText: `×${UP_FAB_YIELD_FACTOR.toFixed(2)} Structure / level`,
    cost: (level) => UP_FAB_YIELD_COST[0] * Math.pow(UP_FAB_YIELD_COST[1], level),
    contributions: (level) => [{ target: 'structure', factor: Math.pow(UP_FAB_YIELD_FACTOR, level) }],
  },
  {
    id: 'throughput',
    name: 'Throughput',
    effectText: `×${UP_THROUGHPUT_FACTOR.toFixed(2)} Energy & Matter / level`,
    cost: (level) => UP_THROUGHPUT_COST[0] * Math.pow(UP_THROUGHPUT_COST[1], level),
    // Throughput targets BOTH inputs — emit one contribution per resource.
    contributions: (level) => [
      { target: 'energy', factor: Math.pow(UP_THROUGHPUT_FACTOR, level) },
      { target: 'matter', factor: Math.pow(UP_THROUGHPUT_FACTOR, level) },
    ],
  },
  {
    id: 'resonance',
    name: 'Resonance',
    effectText: `×${UP_RESONANCE_FACTOR.toFixed(2)} ALL production / level`,
    cost: (level) => UP_RESONANCE_COST[0] * Math.pow(UP_RESONANCE_COST[1], level),
    contributions: (level) => [{ target: 'all', factor: Math.pow(UP_RESONANCE_FACTOR, level) }],
  },
  {
    id: 'collapseYield',
    name: 'Collapse Yield',
    effectText: `+${Math.round(UP_COLLAPSE_YIELD_STEP * 100)}% σ on Collapse / level`,
    cost: (level) => UP_COLLAPSE_YIELD_COST[0] * Math.pow(UP_COLLAPSE_YIELD_COST[1], level),
    // Additive: +10% per level => factor (1 + 0.10*level). Targets σ-gain, not production,
    // so 'all' production multipliers never touch it (see multipliers.js).
    contributions: (level) => [{ target: 'sigmaGain', factor: 1 + UP_COLLAPSE_YIELD_STEP * level }],
  },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));
