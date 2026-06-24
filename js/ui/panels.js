// panels.js — the offline-gains modal and the settings/save panel
// (Export / Import / Hard Reset). Pure UI: it calls back into handlers provided
// by main.js, and never touches the simulation directly.

import { format } from '../engine/format.js';
import { RESOURCE_BY_ID } from '../content/resources.js';

function formatDuration(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Show the offline-gains modal. `gains` is a { resourceId: amountGained } map.
// `awaySeconds` is real time away; `saturated` notes the T_CAP transparency line.
export function showOfflineModal(root, { awaySeconds, gains, saturatedNote }) {
  const modal = root.querySelector('#offline-modal');
  const body = modal.querySelector('#offline-body');

  const lines = Object.entries(gains)
    .filter(([, v]) => v > 0)
    .map(([id, v]) => {
      const name = RESOURCE_BY_ID[id] ? RESOURCE_BY_ID[id].name : id;
      return `<div class="gain-row"><span>${name}</span><span>+${format(v)}</span></div>`;
    })
    .join('');

  body.innerHTML = `
    <p>You were away for <strong>${formatDuration(awaySeconds)}</strong>.</p>
    <div class="gains">${lines || '<div class="gain-row">No gains.</div>'}</div>
    <p class="note">Offline Structure counts toward your next Collapse.</p>
    <p class="note">${saturatedNote}</p>`;

  modal.classList.add('open');
}

// Tier-unlock notification banner: title + one-line explanation, auto-dismiss,
// tap to dismiss early. Used for the "New tier unlocked" milestone moments.
let noticeTimer = null;
export function showNotice(root, title, body) {
  const el = root.querySelector('#notice');
  el.querySelector('[data-notice-title]').textContent = title;
  el.querySelector('[data-notice-body]').textContent = body;
  el.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove('show'), 6500);
}

// Wire up the settings panel: toggle, export, import, hard reset. `handlers`
// supplies the actual behaviors so this stays decoupled from engine modules.
export function initPanels(root, handlers) {
  // Offline modal dismiss
  const offlineModal = root.querySelector('#offline-modal');
  offlineModal.querySelector('[data-close-offline]').addEventListener('click', () => {
    offlineModal.classList.remove('open');
  });

  // Tier-unlock notice — tap to dismiss.
  root.querySelector('#notice').addEventListener('click', (e) => {
    e.currentTarget.classList.remove('show');
  });

  // Settings panel toggle
  const panel = root.querySelector('#settings-panel');
  root.querySelector('#settings-toggle').addEventListener('click', () => {
    panel.classList.toggle('open');
  });

  // Export -> fill textarea + copy to clipboard
  const io = root.querySelector('#io-text');
  root.querySelector('[data-export]').addEventListener('click', async () => {
    const text = handlers.onExport();
    io.value = text;
    io.select();
    try {
      await navigator.clipboard.writeText(text);
      flash(root, 'Save copied to clipboard.');
    } catch {
      flash(root, 'Save written below — copy it manually.');
    }
  });

  // Import <- textarea contents
  root.querySelector('[data-import]').addEventListener('click', () => {
    const text = io.value.trim();
    if (!text) {
      flash(root, 'Paste a save string into the box first.');
      return;
    }
    try {
      handlers.onImport(text);
      flash(root, 'Save imported.');
      panel.classList.remove('open');
    } catch (err) {
      flash(root, `Import failed: ${err.message}`);
    }
  });

  // Hard reset (confirm-gated)
  root.querySelector('[data-reset]').addEventListener('click', () => {
    if (confirm('Hard reset wipes your save permanently. Continue?')) {
      handlers.onReset();
      flash(root, 'Save wiped.');
      panel.classList.remove('open');
    }
  });
}

let flashTimer = null;
function flash(root, msg) {
  const el = root.querySelector('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// Public toast (e.g. Resonance catch feedback, Flux ability confirmations).
export function showToast(root, msg) {
  flash(root, msg);
}
