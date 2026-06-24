// generators.js — PURE GENERATOR HELPERS (Phase 3+).
//
// The generator DATA now lives per-Scale in scales.js (each Scale's `ladder`).
// This module holds only the Scale-AGNOSTIC logic that operates on a single
// generator object — the uniform converter rule, geometric cost math, and the
// purchase primitive. The engine/UI obtain the active ladder via generatorsOf(state)
// and feed individual gens here, so nothing here is Scale-specific.
//
// Generator object fields (defined in scales.js):
//   id, name, costResource, baseCost, costGrowth, produces
//   converters additionally: chainIndex, tierResource, rate, consumes

// --- The uniform converter rule (the heart of progressive deepening) ----------
// A converter at chainIndex i is ACTIVE iff i <= unlockedDepth. Producers (no
// chainIndex) are always active.
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

// The single purchase primitive — used by the manual buy AND the Automator, so the
// geometric-cost spend lives in exactly one place. Returns the count actually bought.
export function applyPurchase(state, gen, count) {
  if (count <= 0) return 0;
  const owned = state.generators[gen.id] || 0;
  const cost = bulkCost(gen, owned, count);
  if ((state.resources[gen.costResource] || 0) < cost) return 0;
  state.resources[gen.costResource] -= cost;
  state.generators[gen.id] = owned + count;
  return count;
}
