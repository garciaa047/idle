// main.js — entry point. Boots state, applies offline gains, wires the rAF game
// loop + input events, autosaves, and registers the service worker.

import {
  AUTOSAVE_INTERVAL,
  FRAME_DT_CLAMP,
  OFFLINE_MIN_SECONDS,
  T_CAP,
} from './engine/constants.js';
import { advance } from './engine/tick.js';
import { loadState, saveState, hardReset, exportSave, importSave } from './engine/save.js';
import { elapsedSeconds, effectiveSeconds } from './engine/offline.js';
import { GENERATOR_BY_ID, bulkCost, maxAffordable } from './content/generators.js';
import { triggerOverclock } from './engine/overclock.js';
import { performCollapse, canCollapse, sigmaGain, buyUpgrade } from './engine/prestige.js';
import { initRender, render } from './ui/render.js';
import { initPanels, showOfflineModal } from './ui/panels.js';

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

function overclock() {
  if (triggerOverclock(state)) beat('overclock');
}

function collapse() {
  if (!canCollapse(state)) return;
  const gain = sigmaGain(state);
  if (!confirm(`Collapse now for ${gain} σ?\n\nThis resets your production (Energy, Matter, Structure, generators) to the Scale seed. σ and σ-upgrades are kept.`)) return;
  performCollapse(state);
  state.flags.sawSigma = true; // reveal the σ-shop from here on
  beat('collapse');
  saveState(state);
}

function buySigmaUpgrade(upId) {
  if (buyUpgrade(state, upId)) state.flags.sawSigma = true;
}

// Lightweight visual beat (CSS flash); real juice is Phase 8.
function beat(kind) {
  root.classList.add(`beat-${kind}`);
  setTimeout(() => root.classList.remove(`beat-${kind}`), 450);
}

// --- Offline catch-up: reuse the SAME advance() as the live loop ------------
function applyOffline() {
  const away = elapsedSeconds(state);
  if (away < OFFLINE_MIN_SECONDS) return;

  // Snapshot to report gains.
  const before = { ...state.resources };
  advance(state, effectiveSeconds(away));

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

applyOffline();

// --- Live game loop: real delta-time, clamped, fed to advance() -------------
let lastFrame = performance.now();
function frame(now) {
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  // Clamp to absorb tab-lag / background spikes; long gaps are offline, handled above.
  if (dt > FRAME_DT_CLAMP) dt = FRAME_DT_CLAMP;
  if (dt > 0) advance(state, dt);
  render(state, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Autosave: interval + reliable iOS backgrounding hooks ------------------
setInterval(() => saveState(state), AUTOSAVE_INTERVAL * 1000);

// visibilitychange->hidden and pagehide are the reliable backgrounding signals
// on iOS Safari. beforeunload is unreliable on mobile, so we do not depend on it.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveState(state);
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
