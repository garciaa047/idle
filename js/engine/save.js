// save.js — localStorage autosave, export/import, hard reset, and the migration
// framework. Export/Import are the safety net against iOS evicting site storage,
// so they must be reliable.

import { SAVE_VERSION, SEED_STRUCTURE, UNLOCK_THRESHOLDS } from './constants.js';
import { defaultState } from './state.js';

const STORAGE_KEY = 'aeonforge.save';

// --- Migration framework ----------------------------------------------------
// MIGRATIONS[v] upgrades a save FROM version v TO version v+1. On load we run
// them in order until the save reaches SAVE_VERSION, so old saves never break
// when the schema changes in later phases. mergeDefaults() then backfills any
// fields a migration didn't set explicitly.
const MIGRATIONS = {
  // v1 (Phase 0: Energy + placeholder Collector) -> v2 (Phase 1: Scale 1 economy).
  // Drop the placeholder, introduce Matter/Structure, the three real generators,
  // σ + σ-upgrades, overclock timers, and the cumulative Collapse counter.
  // User settings are preserved untouched.
  1: (s) => {
    s.resources = s.resources || {};
    s.resources.matter = s.resources.matter ?? 0;
    s.resources.structure = s.resources.structure ?? SEED_STRUCTURE;

    // Remove the Phase 0 placeholder; start the real generators at zero.
    s.generators = { reactor: 0, extractor: 0, fabricator: 0 };

    s.sigma = 0;
    s.sigmaUpgrades = { fabricationYield: 0, throughput: 0, resonance: 0, collapseYield: 0 };
    s.structureThisCollapse = 0;
    s.overclockEndsAt = 0;
    s.overclockCooldownEndsAt = 0;

    s.settings = s.settings || {};
    if (s.settings.buyAmount === undefined) s.settings.buyAmount = 1;
    return s;
  },

  // v2 (Phase 1: Scale 1 economy) -> v3 (Phase 2: refinement chain + Flux +
  // Resonance). Initialise the new intermediate stocks, the three upper
  // converters, and the chain/flux/resonance fields. Settings preserved.
  2: (s) => {
    s.resources = s.resources || {};
    s.resources.components = s.resources.components ?? 0;
    s.resources.modules = s.resources.modules ?? 0;
    s.resources.engines = s.resources.engines ?? 0;

    s.generators = s.generators || {};
    s.generators.assembler = s.generators.assembler ?? 0;
    s.generators.synthesizer = s.generators.synthesizer ?? 0;
    s.generators.integrator = s.generators.integrator ?? 0;

    // Seed lifetimeStructure from the best signal an old save has, so depth seeding
    // below isn't punitive to a returning tester (they had no such counter before).
    s.lifetimeStructure = Math.max(s.structureThisCollapse || 0, s.resources.structure || 0);

    // Seed unlockedDepth from existing progress: anyone who has earned σ (or bought
    // a σ-upgrade) keeps at least depth 1; derive any higher depth from lifetime.
    const hasProgress = (s.sigma || 0) > 0
      || Object.values(s.sigmaUpgrades || {}).some((lvl) => (lvl || 0) > 0);
    let depth = hasProgress ? 1 : 0;
    for (let i = 0; i < UNLOCK_THRESHOLDS.length; i += 1) {
      if (s.lifetimeStructure >= UNLOCK_THRESHOLDS[i]) depth = i + 1;
    }
    s.unlockedDepth = depth;

    s.surgeEndsAt = 0;
    s.overdriveEndsAt = 0;
    s.flux = 0;
    s.singularityFocusArmed = false;
    s.resonanceNextAt = 0;
    return s;
  },
};

function migrate(state) {
  let s = state;
  let v = typeof s.version === 'number' ? s.version : 1;
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) break; // no migration registered; stop and let merge backfill fields
    s = fn(s);
    v += 1;
    s.version = v;
  }
  return s;
}

// Backfill any keys present in a fresh default but missing from a loaded save,
// so adding a field (resource/generator/setting) never crashes on old saves.
function mergeDefaults(loaded) {
  const base = defaultState();
  const merged = {
    ...base,
    ...loaded,
    resources: { ...base.resources, ...(loaded.resources || {}) },
    generators: { ...base.generators, ...(loaded.generators || {}) },
    sigmaUpgrades: { ...base.sigmaUpgrades, ...(loaded.sigmaUpgrades || {}) },
    settings: { ...base.settings, ...(loaded.settings || {}) },
    flags: { ...base.flags, ...(loaded.flags || {}) },
  };
  return merged;
}

// --- Core save/load ---------------------------------------------------------

export function saveState(state) {
  state.lastSaved = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('Save failed:', err);
    return false;
  }
}

// Returns a usable state object: a fresh default if nothing is stored, otherwise
// the loaded save run through migrations + default backfill.
export function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Load failed:', err);
    return defaultState();
  }
  if (!raw) return defaultState();

  try {
    const parsed = JSON.parse(raw);
    return mergeDefaults(migrate(parsed));
  } catch (err) {
    console.warn('Save corrupt, starting fresh:', err);
    return defaultState();
  }
}

export function hardReset() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Reset failed:', err);
  }
  return defaultState();
}

// --- Export / Import (base64-encoded JSON) ----------------------------------

export function exportSave(state) {
  const json = JSON.stringify(state);
  // btoa needs latin1; encodeURIComponent->unescape handles any unicode safely.
  return btoa(unescape(encodeURIComponent(json)));
}

// Parse a pasted export string back into a validated state. Throws on garbage.
export function importSave(text) {
  const json = decodeURIComponent(escape(atob(text.trim())));
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !parsed.resources) {
    throw new Error('Not a valid Aeon Forge save.');
  }
  return mergeDefaults(migrate(parsed));
}
