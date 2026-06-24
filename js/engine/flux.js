// flux.js — Flux, the active-only currency, plus its three strategic abilities.
//
// Flux FILLS from active play (Overclock taps, Resonance catches, a small trickle
// while the document is visible) and DRAINS while the document is hidden. It is
// the lever that gives active players a bounded edge WITHOUT gating idle players:
// an idler never engages with it and still reaches everything. All ability effects
// flow through the shared multiplier/state systems and respect wall-clock expiry,
// exactly like Overclock — there is no parallel buff path.

import {
  FLUX_CAP, FLUX_TRICKLE, FLUX_DRAIN,
  OVERDRIVE_COST, OVERDRIVE_DURATION,
  CONVERGENCE_COST, CONVERGENCE_SECONDS,
  SINGULARITY_FOCUS_COST,
} from './constants.js';
import { GENERATORS, isActive } from '../content/generators.js';

// Clamp every Flux mutation into [0, FLUX_CAP] — the single place flux changes size.
export function addFlux(state, amount) {
  state.flux = Math.max(0, Math.min(FLUX_CAP, (state.flux || 0) + amount));
}

// Real-time Flux change over `dtSeconds`: trickle up while VISIBLE, drain while
// HIDDEN. Kept OUT of advance()/tick — flux tracks wall-clock + visibility, not
// simulated game time, so it must never be fast-forwarded by offline catch-up.
export function tickFlux(state, dtSeconds, visible) {
  if (!(dtSeconds > 0)) return;
  addFlux(state, (visible ? FLUX_TRICKLE : -FLUX_DRAIN) * dtSeconds);
}

// --- Abilities (spend Flux for bounded, strategic effects) ------------------

export function overdriveActive(state, now = Date.now()) {
  return (state.overdriveEndsAt || 0) > now;
}
export function canOverdrive(state, now = Date.now()) {
  return (state.flux || 0) >= OVERDRIVE_COST && !overdriveActive(state, now);
}
// Overdrive — ×OVERDRIVE_MULT all production for OVERDRIVE_DURATION s (multiplier
// added in multipliers.js while overdriveEndsAt is in the future).
export function triggerOverdrive(state, now = Date.now()) {
  if (!canOverdrive(state, now)) return false;
  state.flux -= OVERDRIVE_COST;
  state.overdriveEndsAt = now + OVERDRIVE_DURATION * 1000;
  return true;
}

export function canConvergence(state) {
  return (state.flux || 0) >= CONVERGENCE_COST;
}
// Convergence — instantly fill every active intermediate stock to ~CONVERGENCE_SECONDS
// of its consumer's demand, clearing throttling temporarily ("unclog the factory").
// Only the intermediate STOCKS are topped up; raw Energy/Matter are producer-fed.
export function triggerConvergence(state) {
  if (!canConvergence(state)) return false;
  state.flux -= CONVERGENCE_COST;
  const depth = state.unlockedDepth || 0;
  for (const gen of GENERATORS) {
    if (!gen.consumes) continue;
    if (!isActive(gen, depth)) continue;
    for (const res in gen.consumes) {
      if (res === 'energy' || res === 'matter') continue; // not stockpiled intermediates
      const demand = (state.generators[gen.id] || 0) * gen.consumes[res];
      const target = demand * CONVERGENCE_SECONDS;
      if ((state.resources[res] || 0) < target) state.resources[res] = target;
    }
  }
  return true;
}

export function canFocus(state) {
  return (state.flux || 0) >= SINGULARITY_FOCUS_COST && !state.singularityFocusArmed;
}
// Singularity Focus — arm a one-shot +σ bonus consumed by the next Collapse
// (the sigmaGain contribution lives in multipliers.js; cleared in performCollapse).
export function triggerFocus(state) {
  if (!canFocus(state)) return false;
  state.flux -= SINGULARITY_FOCUS_COST;
  state.singularityFocusArmed = true;
  return true;
}
