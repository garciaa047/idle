// render.js — reads `state` + `content` and updates the DOM. NEVER mutates state.
// Throttled to ~20-30fps (and skips writes when displayed text is unchanged) to
// save iPhone battery during long idle sessions, even though the sim ticks every
// frame.

import { format } from '../engine/format.js';
import { rateOf } from '../engine/tick.js';
import { RESOURCES } from '../content/resources.js';
import { GENERATORS, costFor } from '../content/generators.js';

const RENDER_INTERVAL = 1000 / 30; // ~30fps cap on DOM updates

let lastRender = 0;
const lastText = new Map(); // element -> last written string, to skip no-op writes

// Cached DOM references, built once on init.
let els = null;

function setText(el, text) {
  if (!el) return;
  if (lastText.get(el) === text) return;
  lastText.set(el, text);
  el.textContent = text;
}

// Build the static DOM skeleton (resource readouts + generator rows) once.
export function initRender(root, handlers) {
  // --- Resources ---
  const resourceWrap = root.querySelector('#resources');
  const resourceEls = {};
  for (const r of RESOURCES) {
    const card = document.createElement('div');
    card.className = 'resource';
    card.innerHTML = `
      <div class="resource-name">${r.name}</div>
      <div class="resource-amount" data-amount></div>
      <div class="resource-rate" data-rate></div>`;
    resourceWrap.appendChild(card);
    resourceEls[r.id] = {
      amount: card.querySelector('[data-amount]'),
      rate: card.querySelector('[data-rate]'),
    };
  }

  // --- Generators ---
  const genWrap = root.querySelector('#generators');
  const genEls = {};
  for (const g of GENERATORS) {
    const row = document.createElement('div');
    row.className = 'generator';
    row.innerHTML = `
      <div class="gen-info">
        <div class="gen-name">${g.name}</div>
        <div class="gen-meta">
          Owned <span data-owned>0</span> · +<span data-each></span>/s each
        </div>
      </div>
      <button class="gen-buy" data-buy>
        Buy<br><span class="gen-cost" data-cost></span>
      </button>`;
    genWrap.appendChild(row);
    const buyBtn = row.querySelector('[data-buy]');
    buyBtn.addEventListener('click', () => handlers.onBuy(g.id));
    genEls[g.id] = {
      owned: row.querySelector('[data-owned]'),
      each: row.querySelector('[data-each]'),
      cost: row.querySelector('[data-cost]'),
      buy: buyBtn,
    };
    setText(genEls[g.id].each, format(g.baseRate));
  }

  els = { resources: resourceEls, generators: genEls };
}

// Called every animation frame with the current state; throttles its own work.
export function render(state, now = performance.now()) {
  if (!els) return;
  if (now - lastRender < RENDER_INTERVAL) return;
  lastRender = now;

  for (const r of RESOURCES) {
    const e = els.resources[r.id];
    setText(e.amount, format(state.resources[r.id] || 0));
    setText(e.rate, `${format(rateOf(state, r.id))}/s`);
  }

  for (const g of GENERATORS) {
    const e = els.generators[g.id];
    const owned = state.generators[g.id] || 0;
    const cost = costFor(g, owned);
    setText(e.owned, format(owned));
    setText(e.cost, format(cost));
    const affordable = (state.resources[g.costResource] || 0) >= cost;
    if (e.buy.disabled === affordable) e.buy.disabled = !affordable;
  }
}
