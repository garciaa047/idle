// state.js — default-state factory.
//
// `state` is a single plain SERIALIZABLE object: it is the entire save. It holds
// ONLY data that must persist. No functions, no DOM, no derived values. The engine
// reads static `content` definitions (the active Scale via scaleOf(state)) and
// mutates this object; nothing else stores game data.
//
// Phase 3 shape: `currentScale` selects which Scale's definitions are active; the
// WITHIN-SCALE fields (resources, generators, σ + σ-upgrades, unlockedDepth,
// structureThisCollapse, lifetimeStructure, buffs) live flat at top level and are
// rebuilt on Ascend. Cross-Scale fields (aeons, aeonUpgrades, automator, flux,
// settings) persist through every reset.

import { SAVE_VERSION, SEED_STRUCTURE, AUTOMATOR_DEFAULT_RESERVE } from './constants.js';
import { SCALES } from '../content/scales.js';
import { AEON_UPGRADES } from '../content/aeon.js';
import { defaultAutomator } from './automator.js';

export function defaultState() {
  const now = Date.now();
  const scale = SCALES[0]; // a fresh game starts in Scale 1 (Quantum Foam)

  // Build within-Scale state from the Scale's definitions so adding/retheming a
  // resource or generator needs no change here.
  const resources = {};
  for (const r of scale.resources) resources[r.id] = 0;
  resources.structure = SEED_STRUCTURE; // bootstrap seed: buys the first generators

  const generators = {};
  for (const g of scale.ladder) generators[g.id] = 0;
  const sigmaUpgrades = {};
  for (const u of scale.sigma.upgrades) sigmaUpgrades[u.id] = 0;

  // Aeon-shop levels (cross-Scale, permanent).
  const aeonUpgrades = {};
  for (const u of AEON_UPGRADES) aeonUpgrades[u.id] = 0;

  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSaved: now,      // updated on every save; basis for offline elapsed time

    // --- Scale selection ---
    currentScale: 1,

    // --- within-Scale state (rebuilt on Ascend) ---
    resources,
    generators,
    sigma: 0,
    sigmaUpgrades,
    sigmaThisScale: 0,       // cumulative σ EARNED this Scale (never reduced; feeds Æ)
    structureThisCollapse: 0, // cumulative Structure PRODUCED since last Collapse
    lifetimeStructure: 0,     // cumulative Structure ever produced this Scale (drives unlocks)
    unlockedDepth: 0,

    // --- active buffs (wall-clock; cleared on Collapse/Ascend) ---
    overclockEndsAt: 0,
    overclockCooldownEndsAt: 0,
    surgeEndsAt: 0,
    overdriveEndsAt: 0,

    // --- cross-Scale persistent resources / progress ---
    flux: 0,
    singularityFocusArmed: false,
    resonanceNextAt: 0,
    aeons: 0,
    aeonUpgrades,
    automator: defaultAutomator(scale, AUTOMATOR_DEFAULT_RESERVE),

    settings: {
      buyAmount: 1, // 1 | 10 | 'max' — the ×1/×10/Max buy toggle
    },
    flags: {
      sawSigma: false,  // reveals the Singularity shop once σ has been earned
      sawAscend: false, // fires the "Ascension unlocked" moment once
    },
  };
}
