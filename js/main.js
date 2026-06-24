// main.js — entry point. Boots state, applies offline gains, wires the rAF game
// loop + input events, autosaves, and registers the service worker.

import {
  AUTOSAVE_INTERVAL,
  FRAME_DT_CLAMP,
  OFFLINE_MIN_SECONDS,
  T_CAP,
  FLUX_GAIN_OVERCLOCK,
  SURGE_MULT,
  SURGE_DURATION,
} from './engine/constants.js';
import { advance, checkUnlocks } from './engine/tick.js';
import { loadState, saveState, hardReset, exportSave, importSave } from './engine/save.js';
import { elapsedSeconds, effectiveSeconds } from './engine/offline.js';
import { format } from './engine/format.js';
import { GENERATOR_BY_ID, isActive, bulkCost, maxAffordable } from './content/generators.js';
import { triggerOverclock } from './engine/overclock.js';
import { performCollapse, canCollapse, sigmaGain, buyUpgrade } from './engine/prestige.js';
import {
  addFlux, tickFlux, triggerOverdrive, triggerConvergence, triggerFocus,
} from './engine/flux.js';
import {
  scheduleResonance, resonanceDue, pickReward, applyReward,
} from './engine/resonance.js';
import { initRender, render } from './ui/render.js';
import { initPanels, showOfflineModal, showNotice, showToast } from './ui/panels.js';
import { initResonance, spawnResonance, resonanceActive } from './ui/resonance.js';

const root = document.body;

// --- Boot state -------------------------------------------------------------
let state = loadState();

// Request persistent storage (best-effort) so iOS is less likely to evict us.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// --- Buy logic (mutates state; the single place purchases happen) -----------
// Honors the ×1 / ×10 / Max toggle: buy up to the chosen count or as many as
// affordable, whichever is smaller. Closed-form geometric cost — no loop.
function buy(genId) {
  const gen = GENERATOR_BY_ID[genId];
  if (!gen) return;
  if (!isActive(gen, state.unlockedDepth || 0)) return; // a locked tier isn't purchasable
  const owned = state.generators[genId] || 0;
  const budget = state.resources[gen.costResource] || 0;
  const amt = state.settings.buyAmount;
  const affordable = maxAffordable(gen, owned, budget);
  const count = amt === 'max' ? affordable : Math.min(amt, affordable);
  if (count <= 0) return;
  state.resources[gen.costResource] -= bulkCost(gen, owned, count);
  state.generators[genId] = owned + count;
}

function setBuyAmount(amt) {
  state.settings.buyAmount = amt;
}

// Overclock tap also feeds Flux (active play -> Flux -> strategic abilities).
function overclock() {
  if (triggerOverclock(state)) {
    addFlux(state, FLUX_GAIN_OVERCLOCK);
    beat('overclock');
  }
}

// --- Flux abilities ---------------------------------------------------------
function overdrive() {
  if (triggerOverdrive(state)) { beat('overclock'); showToast(root, 'Overdrive engaged.'); }
}
function convergence() {
  if (triggerConvergence(state)) showToast(root, 'Factory converged — intermediate stocks topped up.');
}
function focus() {
  if (triggerFocus(state)) showToast(root, 'Singularity Focus armed for your next Collapse.');
}

function collapse() {
  if (!canCollapse(state)) return;
  const gain = sigmaGain(state);
  if (!confirm(`Collapse now for ${gain} σ?\n\nThis resets your production (resources + generators) to the Scale seed. σ, σ-upgrades, your unlocked tiers, and Flux are kept.`)) return;
  performCollapse(state);
  state.flags.sawSigma = true; // reveal the σ-shop (and the Flux panel) from here on
  beat('collapse');
  saveState(state);
}

function buySigmaUpgrade(upId) {
  if (buyUpgrade(state, upId)) state.flags.sawSigma = true;
}

// --- Resonance catch: roll + apply the weighted reward, then reschedule ------
function catchResonance() {
  const kind = pickReward();
  const res = applyReward(state, kind);
  if (kind === 'surge') showToast(root, `Surge! ×${SURGE_MULT} production for ${SURGE_DURATION}s.`);
  else if (kind === 'cache') showToast(root, `Cache! +${format(res.amount)} Structure.`);
  else showToast(root, `Flux burst! +${res.amount} ⚡`);
  beat('overclock');
  scheduleResonance(state); // queue the next spawn
}

// Lightweight visual beat (CSS flash); real juice is Phase 8.
function beat(kind) {
  root.classList.add(`beat-${kind}`);
  setTimeout(() => root.classList.remove(`beat-${kind}`), 450);
}

// Fire a "New tier unlocked" notice for each newly-crossed chain threshold.
function notifyUnlocks(list) {
  for (const u of list) showNotice(root, 'New tier unlocked', u.blurb);
}

// --- Offline catch-up: reuse the SAME advance() as the live loop ------------
function applyOffline() {
  const away = elapsedSeconds(state);
  if (away < OFFLINE_MIN_SECONDS) return;

  // Flux drains in real (wall-clock) time while away — never fast-forwarded.
  tickFlux(state, away, false);

  // Snapshot to report gains.
  const before = { ...state.resources };
  advance(state, effectiveSeconds(away));
  notifyUnlocks(checkUnlocks(state)); // offline production can cross unlock thresholds

  const gains = {};
  for (const id of Object.keys(state.resources)) {
    gains[id] = (state.resources[id] || 0) - (before[id] || 0);
  }
  showOfflineModal(root, {
    awaySeconds: away,
    gains,
    saturatedNote: `Offline production saturates near ${Math.round(T_CAP / 3600)}h away.`,
  });
}

// --- UI wiring --------------------------------------------------------------
initRender(root, {
  onBuy: buy,
  onSetBuyAmount: setBuyAmount,
  onOverclock: overclock,
  onOverdrive: overdrive,
  onConvergence: convergence,
  onFocus: focus,
  onCollapse: collapse,
  onBuyUpgrade: buySigmaUpgrade,
});
initPanels(root, {
  onExport: () => exportSave(state),
  onImport: (text) => {
    state = importSave(text);
    saveState(state);
  },
  onReset: () => {
    state = hardReset();
    saveState(state);
  },
});
initResonance(root, { onCatch: catchResonance });

applyOffline();

// --- Live game loop: real delta-time, clamped, fed to advance() -------------
let lastFrame = performance.now();
function frame(now) {
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  // Clamp to absorb tab-lag / background spikes; long gaps are offline, handled above.
  if (dt > FRAME_DT_CLAMP) dt = FRAME_DT_CLAMP;
  if (dt > 0) {
    advance(state, dt);
    // The rAF loop only runs while the document is visible, so this is the
    // visible Flux trickle; hidden drain is applied on resume / offline.
    tickFlux(state, dt, true);
  }

  // Progressive deepening can trigger live; notify on each new unlock.
  notifyUnlocks(checkUnlocks(state));

  // Resonance spawns only while visible. Schedule the first one lazily, then spawn
  // whenever one is due and none is on screen.
  if (!state.resonanceNextAt) scheduleResonance(state);
  if (resonanceDue(state) && !resonanceActive()) {
    spawnResonance();
    scheduleResonance(state);
  }

  render(state, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Autosave: interval + reliable iOS backgrounding hooks ------------------
setInterval(() => saveState(state), AUTOSAVE_INTERVAL * 1000);

// visibilitychange->hidden and pagehide are the reliable backgrounding signals
// on iOS Safari. beforeunload is unreliable on mobile, so we do not depend on it.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    saveState(state);
  } else {
    // Returning to visible: drain Flux for the time spent hidden, and reset the
    // frame clock so the first frame's dt isn't a huge spike.
    if (hiddenAt) {
      tickFlux(state, (Date.now() - hiddenAt) / 1000, false);
      hiddenAt = 0;
    }
    lastFrame = performance.now();
  }
});
window.addEventListener('pagehide', () => saveState(state));

// --- Service worker (relative URL; skip on file://) -------------------------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
