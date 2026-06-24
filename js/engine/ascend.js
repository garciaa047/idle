// ascend.js — Ascend, the HARD reset (the prestige-of-prestige). Within a Scale
// the player Collapses repeatedly to bank σ; once the Scale is exhausted they
// Ascend to the next Scale, converting banked σ into permanent, cross-Scale Aeons.
//
// THE RESET/KEEP SPLIT is the most bug-prone part of the game — it is spelled out
// explicitly below and centralised in performAscend() so nothing drifts.

import { ASCEND_SIGMA_REQ, AEON_A, AEON_Q, SEED_STRUCTURE } from './constants.js';
import { scaleOf, hasNextScale } from '../content/scales.js';
import { AEON_UPGRADE_BY_ID } from '../content/aeon.js';

// Æ = floor( AEON_A * currentScale^AEON_Q * log10(1 + sigmaThisScale) ).
// Deeper Scales pay more (Scale^Q); log10 keeps σ from exploding the payout.
export function ascendGain(state) {
  const sts = state.sigmaThisScale || 0;
  if (sts <= 0) return 0;
  const raw = AEON_A * Math.pow(state.currentScale || 1, AEON_Q) * Math.log10(1 + sts);
  return Math.floor(raw);
}

// Gate: experienced the FULL Scale (chain fully deepened) AND built meaningful σ,
// AND there is a next Scale to ascend into.
export function canAscend(state) {
  return (state.unlockedDepth || 0) >= 3
    && (state.sigmaThisScale || 0) >= ASCEND_SIGMA_REQ
    && hasNextScale(state);
}

// Perform the Ascend. RESET/KEEP table (do not edit casually):
//   RESET to fresh next-Scale defaults: resources->seed, generators->0,
//     unlockedDepth->0, σ->0, σ-upgrades->0, structureThisCollapse->0,
//     lifetimeStructure->0, sigmaThisScale->0, all active buffs + Resonance cleared.
//   KEEP/GAIN: aeons (+= new Æ), aeonUpgrades, automator (unlocked + settings),
//     flux, settings, currentScale (incremented).
export function performAscend(state, now = Date.now()) {
  if (!canAscend(state)) return 0;
  const gain = ascendGain(state);

  state.aeons = (state.aeons || 0) + gain; // KEEP/GAIN: bank the Æ
  state.currentScale = (state.currentScale || 1) + 1; // advance the Scale (changes scaleOf)
  state.automator.unlocked = true; // first Ascend unlocks the Automator (kept thereafter)

  // RESET the within-Scale state to the NEW Scale's fresh defaults. scaleOf(state)
  // now points at the next Scale, so we build its resources/generators/σ-upgrades.
  const scale = scaleOf(state);
  const resources = {};
  for (const r of scale.resources) resources[r.id] = 0;
  resources.structure = SEED_STRUCTURE;
  state.resources = resources;

  const generators = {};
  for (const g of scale.ladder) generators[g.id] = 0;
  state.generators = generators;

  const sigmaUpgrades = {};
  for (const u of scale.sigma.upgrades) sigmaUpgrades[u.id] = 0;
  state.sigmaUpgrades = sigmaUpgrades;

  state.sigma = 0;                  // σ is Scale-bound — wiped
  state.sigmaThisScale = 0;
  state.unlockedDepth = 0;          // re-deepen the chain in the new Scale
  state.structureThisCollapse = 0;
  state.lifetimeStructure = 0;

  // Clear all active buffs + Resonance scheduling (Flux itself persists).
  state.overclockEndsAt = 0;
  state.overclockCooldownEndsAt = 0;
  state.surgeEndsAt = 0;
  state.overdriveEndsAt = 0;
  state.singularityFocusArmed = false;
  state.resonanceNextAt = 0;

  return gain;
}

// --- Aeon shop (permanent, cross-Scale) -------------------------------------
export function buyAeonUpgrade(state, id) {
  const up = AEON_UPGRADE_BY_ID[id];
  if (!up) return false;
  const level = state.aeonUpgrades[id] || 0;
  const cost = up.cost(level);
  if ((state.aeons || 0) < cost) return false;
  state.aeons -= cost;
  state.aeonUpgrades[id] = level + 1;
  return true;
}
