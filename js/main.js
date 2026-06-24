// main.js — entry point. Boots state, applies offline gains, wires the rAF game
// loop + input events, autosaves, and registers the service worker.

import {
  AUTOSAVE_INTERVAL,
  FRAME_DT_CLAMP,
  OFFLINE_MIN_SECONDS,
  AUTOMATOR_INTERVAL,
  FLUX_GAIN_OVERCLOCK,
  SURGE_MULT,
  SURGE_DURATION,
} from './engine/constants.js';
import { advance, checkUnlocks } from './engine/tick.js';
import { loadState, saveState, hardReset, exportSave, importSave } from './engine/save.js';
import { elapsedSeconds, effectiveSeconds } from './engine/offline.js';
import { format } from './engine/format.js';
import { isActive, bulkCost, maxAffordable } from './content/generators.js';
import { SCALES, scaleOf, generatorById, resourcesOf } from './content/scales.js';
import { tCapOf } from './content/aeon.js';
import { triggerOverclock } from './engine/overclock.js';
import { performCollapse, canCollapse, sigmaGain, buyUpgrade } from './engine/prestige.js';
import { canAscend, ascendGain, performAscend, buyAeonUpgrade } from './engine/ascend.js';
import { runAutomator } from './engine/automator.js';
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

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// --- Buy logic (mutates state; the single place MANUAL purchases happen) -----
function buy(genId) {
  const gen = generatorById(state, genId);
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

function setBuyAmount(amt) { state.settings.buyAmount = amt; }

function overclock() {
  if (triggerOverclock(state)) {
    addFlux(state, FLUX_GAIN_OVERCLOCK);
    beat('overclock');
  }
}

// --- Flux abilities ---------------------------------------------------------
function overdrive() { if (triggerOverdrive(state)) { beat('overclock'); showToast(root, 'Overdrive engaged.'); } }
function convergence() { if (triggerConvergence(state)) showToast(root, 'Factory converged — intermediate stocks topped up.'); }
function focus() { if (triggerFocus(state)) showToast(root, 'Singularity Focus armed for your next Collapse.'); }

function collapse() {
  if (!canCollapse(state)) return;
  const gain = sigmaGain(state);
  if (!confirm(`Collapse now for ${gain} σ?\n\nThis resets your production (resources + generators) to the Scale seed. σ, σ-upgrades, your unlocked tiers, and Flux are kept.`)) return;
  performCollapse(state);
  state.flags.sawSigma = true;
  beat('collapse');
  saveState(state);
}

function buySigmaUpgrade(upId) { if (buyUpgrade(state, upId)) state.flags.sawSigma = true; }

// --- Ascend + Aeon shop -----------------------------------------------------
function ascend() {
  if (!canAscend(state)) return;
  const gain = ascendGain(state);
  const next = SCALES[state.currentScale]; // index = currentScale -> the NEXT Scale def
  if (!confirm(`Ascend to ${next.name} for ${gain} Æ?\n\nσ and this Scale's upgrades are WIPED. Aeons, the Aeon shop, the Automator, and Flux are permanent — and the next Scale ramps faster.`)) return;
  performAscend(state);
  beat('collapse');
  showNotice(root, `Ascended — ${scaleOf(state).name}`, 'A new Scale, re-themed. Your Aeon upgrades and Automator carried over; spend Æ to power up.');
  saveState(state);
}

function buyAeon(id) { buyAeonUpgrade(state, id); }

// --- Automator settings -----------------------------------------------------
function autoMaster() { state.automator.master = !state.automator.master; }
function autoGen(id) { state.automator.perGen[id] = !state.automator.perGen[id]; }
function autoReserve(pct) { state.automator.reservePct = Math.max(0, Math.min(90, pct || 0)); }
function autoCheapest(on) { state.automator.buyCheapest = !!on; }

// --- Resonance catch --------------------------------------------------------
function catchResonance() {
  const kind = pickReward();
  const res = applyReward(state, kind);
  if (kind === 'surge') showToast(root, `Surge! ×${SURGE_MULT} production for ${SURGE_DURATION}s.`);
  else if (kind === 'cache') showToast(root, `Cache! +${format(res.amount)} Structure.`);
  else showToast(root, `Flux burst! +${res.amount} ⚡`);
  beat('overclock');
  scheduleResonance(state);
}

function beat(kind) {
  root.classList.add(`beat-${kind}`);
  setTimeout(() => root.classList.remove(`beat-${kind}`), 450);
}

function notifyUnlocks(list) {
  for (const u of list) showNotice(root, 'New tier unlocked', u.blurb);
}

// Latch the "Ascension unlocked" moment the first time the gate opens.
function checkAscendGate() {
  if (!state.flags.sawAscend && canAscend(state)) {
    state.flags.sawAscend = true;
    showNotice(root, 'Ascension unlocked', 'You have mastered this Scale. Ascend to mint permanent Aeons and unlock the Automator.');
  }
}

// --- Offline catch-up: reuse the SAME advance() as the live loop ------------
// The Automator does NOT run offline (offline = production only at departure
// counts); it resumes in the foreground.
function applyOffline() {
  const away = elapsedSeconds(state);
  if (away < OFFLINE_MIN_SECONDS) return;

  tickFlux(state, away, false); // Flux drains in real time while away

  const tCap = tCapOf(state);
  const eff = effectiveSeconds(away, tCap);
  const before = { ...state.resources };
  advance(state, eff);
  notifyUnlocks(checkUnlocks(state));

  const gains = {};
  for (const id of Object.keys(state.resources)) {
    gains[id] = (state.resources[id] || 0) - (before[id] || 0);
  }
  const names = {};
  for (const r of resourcesOf(state)) names[r.id] = r.name;

  showOfflineModal(root, { awaySeconds: away, effectiveSeconds: eff, tCap, gains, names });
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
  onAscend: ascend,
  onBuyAeon: buyAeon,
  onAutoMaster: autoMaster,
  onAutoGen: autoGen,
  onAutoReserve: autoReserve,
  onAutoCheapest: autoCheapest,
});
initPanels(root, {
  onExport: () => exportSave(state),
  onImport: (text) => { state = importSave(text); saveState(state); },
  onReset: () => { state = hardReset(); saveState(state); },
});
initResonance(root, { onCatch: catchResonance });

applyOffline();

// --- Live game loop ---------------------------------------------------------
let lastFrame = performance.now();
let lastAutomator = 0;
function frame(now) {
  let dt = (now - lastFrame) / 1000;
  lastFrame = now;
  if (dt > FRAME_DT_CLAMP) dt = FRAME_DT_CLAMP;
  if (dt > 0) {
    advance(state, dt);
    tickFlux(state, dt, true); // visible trickle
  }

  notifyUnlocks(checkUnlocks(state));
  checkAscendGate();

  // Automator runs a few times/sec in the FOREGROUND only (never offline).
  if (now - lastAutomator >= AUTOMATOR_INTERVAL * 1000) {
    lastAutomator = now;
    runAutomator(state);
  }

  // Resonance spawns only while visible.
  if (!state.resonanceNextAt) scheduleResonance(state);
  if (resonanceDue(state) && !resonanceActive()) {
    spawnResonance();
    scheduleResonance(state);
  }

  render(state, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Autosave ---------------------------------------------------------------
setInterval(() => saveState(state), AUTOSAVE_INTERVAL * 1000);

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    saveState(state);
  } else {
    if (hiddenAt) {
      tickFlux(state, (Date.now() - hiddenAt) / 1000, false); // drain Flux for time hidden
      hiddenAt = 0;
    }
    lastFrame = performance.now();
  }
});
window.addEventListener('pagehide', () => saveState(state));

// --- Service worker ---------------------------------------------------------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}
