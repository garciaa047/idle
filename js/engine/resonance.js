// resonance.js — Resonance pickups: the periodic, tappable burst reward (the
// "golden cookie" of this game). PURE STATE/LOGIC only — spawn scheduling here is
// wall-clock + visibility based and the catch handler mutates state; the drifting
// DOM element lives in ui/resonance.js.
//
// Resonance is an ACTIVE-PLAY reward: it spawns only while the document is visible
// (no offline/background spawns), so it can never become part of the idle path.

import {
  RESONANCE_MIN, RESONANCE_MAX, RESONANCE_WEIGHTS,
  SURGE_DURATION, CACHE_SECONDS, RESONANCE_FLUX_BURST, FLUX_GAIN_RESONANCE,
} from './constants.js';
import { addFlux } from './flux.js';
import { computeFlow } from './tick.js';

// Schedule the next spawn a random RESONANCE_MIN..MAX seconds out (wall-clock).
export function scheduleResonance(state, now = Date.now()) {
  const wait = RESONANCE_MIN + Math.random() * (RESONANCE_MAX - RESONANCE_MIN);
  state.resonanceNextAt = now + wait * 1000;
}

// Is a spawn due? (0 = unscheduled — caller schedules a first one.)
export function resonanceDue(state, now = Date.now()) {
  return (state.resonanceNextAt || 0) !== 0 && now >= (state.resonanceNextAt || 0);
}

// Weighted-random reward kind.
export function pickReward() {
  const r = Math.random();
  let acc = 0;
  for (const [kind, w] of Object.entries(RESONANCE_WEIGHTS)) {
    acc += w;
    if (r < acc) return kind;
  }
  return 'surge';
}

// Apply a caught reward. Catching ALWAYS feeds Flux (+FLUX_GAIN_RESONANCE); the
// rolled reward lands on top. Returns a descriptor the UI turns into feedback.
export function applyReward(state, kind, now = Date.now()) {
  addFlux(state, FLUX_GAIN_RESONANCE); // every catch tops up Flux

  if (kind === 'surge') {
    // A bigger, rarer Overclock — the "frenzy". Stored as a wall-clock end stamp.
    state.surgeEndsAt = now + SURGE_DURATION * 1000;
    return { kind };
  }

  if (kind === 'cache') {
    // Instant Structure ~= CACHE_SECONDS of current effective output.
    const sps = computeFlow(state, now).supply.structure || 0;
    const amount = sps * CACHE_SECONDS;
    state.resources.structure += amount;
    state.structureThisCollapse += amount;
    state.lifetimeStructure = (state.lifetimeStructure || 0) + amount;
    return { kind, amount };
  }

  // Flux burst (on top of the catch bonus already granted above).
  addFlux(state, RESONANCE_FLUX_BURST);
  return { kind, amount: RESONANCE_FLUX_BURST };
}
