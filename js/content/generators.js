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
  ASSEMBLER_BASE_COST, ASSEMBLER_COST_GROWTH,
  SYNTHESIZER_BASE_COST, SYNTHESIZER_COST_GROWTH,
  INTEGRATOR_BASE_COST, INTEGRATOR_COST_GROWTH,
  TIER_MULT, UNLOCK_THRESHOLDS,
} from '../engine/constants.js';

// Converter fields (Phase 2): `chainIndex` is the ladder position; `tierResource`
// is what this converter makes WHEN it is not the top active one; `rate` is the
// units/sec it produces per owned unit at full efficiency. A converter's *output
// resource is dynamic* — see activeOutput() for the single uniform rule.
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
  // --- Converter ladder. Order matters: tick.js processes consumers in array
  // order (bottom -> top) so each tier sees the freshly produced intermediate
  // below it within the same sub-step.
  {
    id: 'fabricator',
    name: 'Fabricator',
    costResource: 'structure',
    baseCost: FABRICATOR_BASE_COST,
    costGrowth: FABRICATOR_COST_GROWTH,
    chainIndex: 0,
    tierResource: 'components',
    rate: FABRICATOR_RATE, // raw boundary: 1 Energy + 1 Matter -> 1 unit (Phase 1 unchanged)
    consumes: { energy: FABRICATOR_CONSUME_ENERGY, matter: FABRICATOR_CONSUME_MATTER },
  },
  {
    id: 'assembler',
    name: 'Assembler',
    costResource: 'structure',
    baseCost: ASSEMBLER_BASE_COST,
    costGrowth: ASSEMBLER_COST_GROWTH,
    chainIndex: 1,
    tierResource: 'modules',
    rate: TIER_MULT,
    consumes: { components: 1 },
  },
  {
    id: 'synthesizer',
    name: 'Synthesizer',
    costResource: 'structure',
    baseCost: SYNTHESIZER_BASE_COST,
    costGrowth: SYNTHESIZER_COST_GROWTH,
    chainIndex: 2,
    tierResource: 'engines',
    rate: TIER_MULT,
    consumes: { modules: 1 },
  },
  {
    id: 'integrator',
    name: 'Integrator',
    costResource: 'structure',
    baseCost: INTEGRATOR_BASE_COST,
    costGrowth: INTEGRATOR_COST_GROWTH,
    chainIndex: 3,
    tierResource: 'structure', // the top of the ladder always forges Structure
    rate: TIER_MULT,
    consumes: { engines: 1 },
  },
];

export const GENERATOR_BY_ID = Object.fromEntries(GENERATORS.map((g) => [g.id, g]));

// --- The uniform converter rule (the heart of progressive deepening) ----------
// A converter at chainIndex i is ACTIVE iff i <= unlockedDepth. Producers (which
// have no chainIndex) are always active.
export function isActive(gen, unlockedDepth) {
  if (gen.chainIndex === undefined) return true;
  return gen.chainIndex <= unlockedDepth;
}

// What `gen` produces RIGHT NOW: { resource, rate } for its single output.
//   - Producers read their static `produces`.
//   - Converters: the highest-index active converter (chainIndex === unlockedDepth)
//     makes Structure; every lower active converter makes its `tierResource`.
// This single rule means deepening is just `unlockedDepth += 1` — no per-tier code.
export function activeOutput(gen, unlockedDepth) {
  if (gen.chainIndex === undefined) {
    const res = Object.keys(gen.produces)[0];
    return { resource: res, rate: gen.produces[res] };
  }
  const resource = gen.chainIndex === unlockedDepth ? 'structure' : gen.tierResource;
  return { resource, rate: gen.rate };
}

// Chain-deepening unlocks as DATA: index i unlocks depth i+1 once lifetimeStructure
// crosses its threshold, revealing one resource + one converter and granting a
// permanent ×TIER_UNLOCK_MULT (applied via unlockedDepth in multipliers.js).
export const CHAIN_UNLOCKS = [
  {
    depth: 1, threshold: UNLOCK_THRESHOLDS[0],
    resource: 'components', converter: 'assembler',
    blurb: 'Fabricators now refine raw input into Components; Assemblers forge them into Structure.',
  },
  {
    depth: 2, threshold: UNLOCK_THRESHOLDS[1],
    resource: 'modules', converter: 'synthesizer',
    blurb: 'Assemblers now build Modules; Synthesizers forge them into Structure.',
  },
  {
    depth: 3, threshold: UNLOCK_THRESHOLDS[2],
    resource: 'engines', converter: 'integrator',
    blurb: 'Synthesizers now build Engines; Integrators forge them into Structure.',
  },
];

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
