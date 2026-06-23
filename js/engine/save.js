// save.js — localStorage autosave, export/import, hard reset, and the migration
// framework. Export/Import are the safety net against iOS evicting site storage,
// so they must be reliable.

import { SAVE_VERSION } from './constants.js';
import { defaultState } from './state.js';

const STORAGE_KEY = 'aeonforge.save';

// --- Migration framework ----------------------------------------------------
// MIGRATIONS[v] upgrades a save FROM version v TO version v+1. On load we run
// them in order until the save reaches SAVE_VERSION, so old saves never break
// when the schema changes in later phases. Phase 0 has none yet — the framework
// exists so future schema changes are a matter of adding one function here.
const MIGRATIONS = {
  // 1: (s) => { /* transform v1 -> v2 */ return s; },
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
