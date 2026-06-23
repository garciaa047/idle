// state.js — default-state factory.
//
// `state` is a single plain SERIALIZABLE object: it is the entire save. It holds
// ONLY data that must persist — resource amounts, owned generator counts, σ and
// σ-upgrade levels, overclock timestamps, the cumulative Collapse counter,
// timestamps, settings, flags, and the schema `version`. No functions, no DOM,
// no derived values. The engine reads static `content` definitions and mutates
// this object; nothing else stores game data.

import { SAVE_VERSION, SEED_STRUCTURE } from './constants.js';
import { RESOURCES } from '../content/resources.js';
import { GENERATORS } from '../content/generators.js';
import { UPGRADES } from '../content/upgrades.js';

export function defaultState() {
  const now = Date.now();

  // Build resource amounts from definitions so adding a resource needs no change here.
  const resources = {};
  for (const r of RESOURCES) resources[r.id] = 0;
  resources.structure = SEED_STRUCTURE; // bootstrap seed: buys the first generators

  // Build owned counts + σ-upgrade levels from definitions for the same reason.
  const generators = {};
  for (const g of GENERATORS) generators[g.id] = 0;
  const sigmaUpgrades = {};
  for (const u of UPGRADES) sigmaUpgrades[u.id] = 0;

  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSaved: now,      // updated on every save; basis for offline elapsed time
    resources,
    generators,

    // --- prestige (persist across Collapses) ---
    sigma: 0,
    sigmaUpgrades,

    // --- run-level counters / buffs (reset on Collapse) ---
    structureThisCollapse: 0, // cumulative Structure PRODUCED since last Collapse
    overclockEndsAt: 0,       // wall-clock ms; surge active while now < this
    overclockCooldownEndsAt: 0,

    settings: {
      buyAmount: 1, // 1 | 10 | 'max' — the ×1/×10/Max buy toggle
    },
    flags: {
      sawSigma: false, // reveals the Singularity shop once σ has been earned
    },
  };
}
