// offline.js — elapsed wall-clock time -> effective simulated seconds.
//
// Offline is NOT a separate math path: we compute effective seconds here with a
// saturating curve, then hand that to the same advance() the live loop uses.
//
// Phase 3: the cap is DERIVED (T_CAP_BASE + Temporal Reservoir). effectiveSeconds
// takes the current cap so the Aeon upgrade visibly extends offline gains.

// Seconds actually elapsed since the save's lastSaved, clamped to >= 0 to absorb
// clock changes (e.g. user moving the device clock backwards).
export function elapsedSeconds(state, now = Date.now()) {
  const seconds = (now - state.lastSaved) / 1000;
  return Math.max(0, seconds);
}

// Saturating cap: effective = tCap * (1 - e^(-elapsed / tCap)).
// Front-loads gains (checking in matters) and caps long absences near tCap.
export function effectiveSeconds(elapsed, tCap) {
  if (!(elapsed > 0) || !(tCap > 0)) return 0;
  return tCap * (1 - Math.exp(-elapsed / tCap));
}
