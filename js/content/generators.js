// generators.js — GENERATOR DEFINITIONS as data (never saved).
//
// THE KEY ARCHITECTURE GUARANTEE: adding a generator in a later phase means
// adding one object to this array — no engine changes. tick.js, render.js and the
// buy/cost logic all iterate these definitions generically and read/write the
// owned counts in state.generators[id].
//
// Fields:
//   id         — stable key, also the state.generators key
//   name       — display name
//   produces   — resource id this generator outputs
//   baseCost   — cost of the first unit, in `costResource`
//   costResource — resource id spent to buy (Phase 0: same as produced)
//   costGrowth — geometric growth r; cost(n) = baseCost * costGrowth^n
//   baseRate   — output per owned unit per second of `produces`

import {
  COLLECTOR_BASE_COST,
  COLLECTOR_COST_GROWTH,
  COLLECTOR_BASE_RATE,
} from '../engine/constants.js';

export const GENERATORS = [
  {
    id: 'collector',
    name: 'Collector',
    produces: 'energy',
    costResource: 'energy',
    baseCost: COLLECTOR_BASE_COST,
    costGrowth: COLLECTOR_COST_GROWTH,
    baseRate: COLLECTOR_BASE_RATE,
  },
];

export const GENERATOR_BY_ID = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));

// Geometric next-purchase cost for a generator given how many are owned.
export function costFor(gen, owned) {
  return gen.baseCost * Math.pow(gen.costGrowth, owned);
}
