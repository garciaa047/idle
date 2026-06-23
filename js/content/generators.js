// generators.js — GENERATOR DEFINITIONS as data (never saved).
//
// THE KEY ARCHITECTURE GUARANTEE: adding a generator in a later phase means
// adding one object to this array — no engine changes. tick.js, render.js and the
// buy/cost logic all iterate these definitions generically and read/write the
// owned counts in state.generators[id].
//
// Fields:
//   id           — stable key, also the state.generators key
//   name         — display name
//   costResource — resource id spent to buy (Scale 1: always Structure)
//   baseCost     — cost of the first unit, in `costResource`
//   costGrowth   — geometric growth r; cost(n) = baseCost * costGrowth^n
//   produces     — { resourceId: ratePerUnitPerSec, ... } this generator outputs
//   consumes     — (optional) { resourceId: ratePerUnitPerSec, ... } inputs it draws.
//                  A generator WITH `consumes` is throttled by input availability
//                  (its efficiency = fraction of demand it can meet); see tick.js.

import {
  REACTOR_BASE_COST, REACTOR_COST_GROWTH, REACTOR_RATE,
  EXTRACTOR_BASE_COST, EXTRACTOR_COST_GROWTH, EXTRACTOR_RATE,
  FABRICATOR_BASE_COST, FABRICATOR_COST_GROWTH, FABRICATOR_RATE,
  FABRICATOR_CONSUME_ENERGY, FABRICATOR_CONSUME_MATTER,
} from '../engine/constants.js';

export const GENERATORS = [
  {
    id: 'reactor',
    name: 'Reactor',
    costResource: 'structure',
    baseCost: REACTOR_BASE_COST,
    costGrowth: REACTOR_COST_GROWTH,
    produces: { energy: REACTOR_RATE },
  },
  {
    id: 'extractor',
    name: 'Extractor',
    costResource: 'structure',
    baseCost: EXTRACTOR_BASE_COST,
    costGrowth: EXTRACTOR_COST_GROWTH,
    produces: { matter: EXTRACTOR_RATE },
  },
  {
    id: 'fabricator',
    name: 'Fabricator',
    costResource: 'structure',
    baseCost: FABRICATOR_BASE_COST,
    costGrowth: FABRICATOR_COST_GROWTH,
    produces: { structure: FABRICATOR_RATE },
    consumes: { energy: FABRICATOR_CONSUME_ENERGY, matter: FABRICATOR_CONSUME_MATTER },
  },
];

export const GENERATOR_BY_ID = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));

// Geometric next-purchase cost for a generator given how many are owned.
export function costFor(gen, owned) {
  return gen.baseCost * Math.pow(gen.costGrowth, owned);
}

// Closed-form total cost of buying `count` units starting from `owned`:
// a geometric series  first * (r^count - 1) / (r - 1).
export function bulkCost(gen, owned, count) {
  if (count <= 0) return 0;
  const r = gen.costGrowth;
  const first = gen.baseCost * Math.pow(r, owned);
  return first * (Math.pow(r, count) - 1) / (r - 1);
}

// Largest count buyable from `budget` (closed-form inverse of the series above).
export function maxAffordable(gen, owned, budget) {
  const r = gen.costGrowth;
  const first = gen.baseCost * Math.pow(r, owned);
  if (budget < first) return 0;
  const k = 1 + (budget * (r - 1)) / first; // r^count <= k
  return Math.floor(Math.log(k) / Math.log(r));
}
