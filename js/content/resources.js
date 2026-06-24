// resources.js — RESOURCE DEFINITIONS as data (never saved; the engine reads these).
//
// State/content split: a resource definition is static description (id, name).
// The *amount* of a resource lives in state.resources[id]. Adding a new resource
// in a later phase = adding one object here; the engine iterates these generically.

// `revealDepth` (Phase 2): the intermediate stocks only appear once the chain is
// deep enough to produce them. A card shows when state.unlockedDepth >= revealDepth.
// Order here is the production chain top-to-bottom, ending in the Structure score.
export const RESOURCES = [
  {
    id: 'energy',
    name: 'Energy',
    symbol: 'E',
    revealDepth: 0,
  },
  {
    id: 'matter',
    name: 'Matter',
    symbol: 'M',
    revealDepth: 0,
  },
  {
    id: 'components',
    name: 'Components',
    symbol: 'Cp',
    revealDepth: 1,
  },
  {
    id: 'modules',
    name: 'Modules',
    symbol: 'Md',
    revealDepth: 2,
  },
  {
    id: 'engines',
    name: 'Engines',
    symbol: 'Eg',
    revealDepth: 3,
  },
  {
    // Structure is the run score AND the currency every generator is bought with.
    id: 'structure',
    name: 'Structure',
    symbol: 'S',
    revealDepth: 0,
  },
];

// Convenience lookup by id.
export const RESOURCE_BY_ID = Object.fromEntries(RESOURCES.map((r) => [r.id, r]));
