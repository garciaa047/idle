// overclock.js — the Overclock active surge, stored as WALL-CLOCK timestamps in
// state (overclockEndsAt, overclockCooldownEndsAt) so it behaves correctly across
// backgrounding: on resume a buff whose window has passed is simply expired. Buff
// time is NOT advanced as offline production time — it elapses in real time.

import { OVERCLOCK_DURATION, OVERCLOCK_COOLDOWN } from './constants.js';

// Surge currently boosting production?
export function overclockActive(state, now = Date.now()) {
  return (state.overclockEndsAt || 0) > now;
}

// Cooldown finished (and not currently active) -> can trigger again.
export function overclockReady(state, now = Date.now()) {
  return !overclockActive(state, now) && (state.overclockCooldownEndsAt || 0) <= now;
}

// One tap = one surge window. Cooldown starts AFTER the surge ends, so the full
// lock-out is DURATION + COOLDOWN seconds.
export function triggerOverclock(state, now = Date.now()) {
  if (!overclockReady(state, now)) return false;
  state.overclockEndsAt = now + OVERCLOCK_DURATION * 1000;
  state.overclockCooldownEndsAt = now + (OVERCLOCK_DURATION + OVERCLOCK_COOLDOWN) * 1000;
  return true;
}

// UI helper: which of the three states + seconds remaining.
export function overclockStatus(state, now = Date.now()) {
  if (overclockActive(state, now)) {
    return { phase: 'active', seconds: Math.ceil((state.overclockEndsAt - now) / 1000) };
  }
  if ((state.overclockCooldownEndsAt || 0) > now) {
    return { phase: 'cooldown', seconds: Math.ceil((state.overclockCooldownEndsAt - now) / 1000) };
  }
  return { phase: 'ready', seconds: 0 };
}
