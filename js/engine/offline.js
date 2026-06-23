// offline.js — elapsed wall-clock time -> effective simulated seconds.
//
// Offline is NOT a separate math path: we compute effective seconds here with a
// saturating curve, then hand that to the same advance() the live loop uses.

import { T_CAP } from './constants.js';

// Seconds actually elapsed since the save's lastSaved, clamped to >= 0 to absorb
// clock changes (e.g. user moving the device clock backwards).
export function elapsedSeconds(state, now = Date.now()) {
  const seconds = (now - state.lastSaved) / 1000;
  return Math.max(0, seconds);
}

// Saturating cap: effective = T_CAP * (1 - e^(-elapsed / T_CAP)).
// Front-loads gains (checking in matters) and caps long absences near T_CAP.
export function effectiveSeconds(elapsed) {
  if (!(elapsed > 0)) return 0;
  return T_CAP * (1 - Math.exp(-elapsed / T_CAP));
}
