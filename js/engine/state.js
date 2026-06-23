// state.js — default-state factory.
//
// `state` is a single plain SERIALIZABLE object: it is the entire save. It holds
// ONLY data that must persist — resource amounts, owned generator counts,
// timestamps, settings, flags, and the schema `version`. No functions, no DOM,
// no derived values. The engine reads static `content` definitions and mutates
// this object; nothing else stores game data.

import { SAVE_VERSION } from './constants.js';
import { RESOURCES } from '../content/resources.js';
import { GENERATORS } from '../content/generators.js';

export function defaultState() {
  const now = Date.now();

  // Build resource amounts from definitions so adding a resource needs no change here.
  const resources = {};
  for (const r of RESOURCES) resources[r.id] = 0;

  // Build owned counts from definitions for the same reason.
  const generators = {};
  for (const g of GENERATORS) generators[g.id] = 0;

  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSaved: now,      // updated on every save; basis for offline elapsed time
    resources,
    generators,
    settings: {
      // room for future toggles; persisted with the save
    },
    flags: {
      // one-shot discovery/unlock flags in later phases
    },
  };
}
