// resources.js — RESOURCE DEFINITIONS as data (never saved; the engine reads these).
//
// State/content split: a resource definition is static description (id, name).
// The *amount* of a resource lives in state.resources[id]. Adding a new resource
// in a later phase = adding one object here; the engine iterates these generically.

export const RESOURCES = [
  {
    id: 'energy',
    name: 'Energy',
    symbol: 'E',
  },
  {
    id: 'matter',
    name: 'Matter',
    symbol: 'M',
  },
  {
    // Structure is the run score AND the currency every generator is bought with.
    id: 'structure',
    name: 'Structure',
    symbol: 'S',
  },
];

// Convenience lookup by id.
export const RESOURCE_BY_ID = Object.fromEntries(RESOURCES.map((r) => [r.id, r]));
