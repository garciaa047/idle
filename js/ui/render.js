// render.js — reads `state` + `content` and updates the DOM. NEVER mutates state.
// Throttled to ~30fps (and skips writes when displayed text is unchanged) to save
// iPhone battery during long idle sessions, even though the sim ticks every frame.

import { format } from '../engine/format.js';
import { rateOf, efficiencyOf, generatorOutput } from '../engine/tick.js';
import { RESOURCES, RESOURCE_BY_ID } from '../content/resources.js';
import { GENERATORS, bulkCost, maxAffordable } from '../content/generators.js';
import { UPGRADES } from '../content/upgrades.js';
import { sigmaGain, canCollapse, upgradeCost } from '../engine/prestige.js';
import { overclockStatus } from '../engine/overclock.js';
import { S_REF, OVERCLOCK_MULT } from '../engine/constants.js';

const RENDER_INTERVAL = 1000 / 30; // ~30fps cap on DOM updates
const BUY_AMOUNTS = [1, 10, 'max'];

let lastRender = 0;
const lastText = new Map(); // element -> last written string, to skip no-op writes
let els = null;             // cached DOM references, built once on init
let handlers = null;

function setText(el, text) {
  if (!el) return;
  if (lastText.get(el) === text) return;
  lastText.set(el, text);
  el.textContent = text;
}

function setDisabled(el, disabled) {
  if (!el) return;
  if (el.disabled !== disabled) el.disabled = disabled;
}

function setClass(el, cls, on) {
  if (!el) return;
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

// How many units the current buy-amount setting would purchase, and their cost.
// Semantics match buy(): "up to the chosen count OR as many as affordable" — so a
// ×10 with only 4 affordable buys 4 and stays actionable. When nothing is
// affordable we still show the next-1 cost so the (disabled) button reads sensibly.
function plannedBuy(state, gen) {
  const owned = state.generators[gen.id] || 0;
  const budget = state.resources[gen.costResource] || 0;
  const amt = state.settings.buyAmount;
  const affordable = maxAffordable(gen, owned, budget);
  const nominal = amt === 'max' ? affordable : Math.min(amt, affordable);
  const count = Math.max(1, nominal); // display falls back to next-1 when unaffordable
  return { count, cost: bulkCost(gen, owned, count), can: affordable >= 1 };
}

// --- Build the static DOM skeleton once -------------------------------------
export function initRender(root, h) {
  handlers = h;

  // Resources
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

  // Overclock button
  const overclockBtn = root.querySelector('#overclock-btn');
  overclockBtn.addEventListener('click', () => handlers.onOverclock());

  // Buy-amount toggle
  const toggleWrap = root.querySelector('#buy-toggle');
  const toggleBtns = {};
  for (const amt of BUY_AMOUNTS) {
    const b = document.createElement('button');
    b.className = 'buy-amt';
    b.textContent = amt === 'max' ? 'Max' : `×${amt}`;
    b.addEventListener('click', () => handlers.onSetBuyAmount(amt));
    toggleWrap.appendChild(b);
    toggleBtns[amt] = b;
  }

  // Generators
  const genWrap = root.querySelector('#generators');
  const genEls = {};
  for (const g of GENERATORS) {
    const row = document.createElement('div');
    row.className = 'generator';
    // Extra meta line for consumers (Fabricator): consumption + efficiency.
    const consumeLine = g.consumes
      ? `<div class="gen-throttle" data-throttle></div>`
      : '';
    row.innerHTML = `
      <div class="gen-info">
        <div class="gen-name">${g.name}</div>
        <div class="gen-meta">Owned <span data-owned>0</span> · <span data-each></span></div>
        ${consumeLine}
      </div>
      <button class="gen-buy" data-buy>
        <span class="buy-label" data-buylabel>Buy</span><br>
        <span class="gen-cost" data-cost></span>
      </button>`;
    genWrap.appendChild(row);
    const buyBtn = row.querySelector('[data-buy]');
    buyBtn.addEventListener('click', () => handlers.onBuy(g.id));
    genEls[g.id] = {
      owned: row.querySelector('[data-owned]'),
      each: row.querySelector('[data-each]'),
      throttle: row.querySelector('[data-throttle]'),
      cost: row.querySelector('[data-cost]'),
      label: row.querySelector('[data-buylabel]'),
      buy: buyBtn,
    };
  }

  // Collapse panel
  const collapse = root.querySelector('#collapse-panel');
  collapse.innerHTML = `
    <div class="panel-head"><h2>Collapse</h2></div>
    <p class="panel-desc">Reset this Scale's production to mint <strong>Singularity (σ)</strong>.
      σ and its upgrades persist; everything else resets.</p>
    <div class="collapse-stat">Structure produced <span data-stc>0</span></div>
    <div class="collapse-stat">σ on Collapse <span class="sigma-gain" data-sigmagain>0</span></div>
    <button class="collapse-btn" data-collapse>Collapse</button>
    <div class="collapse-hint" data-collapsehint></div>`;
  const collapseBtn = collapse.querySelector('[data-collapse]');
  collapseBtn.addEventListener('click', () => handlers.onCollapse());

  // Singularity shop rows
  const shopWrap = root.querySelector('#sigma-upgrades');
  const upgradeEls = {};
  for (const up of UPGRADES) {
    const row = document.createElement('div');
    row.className = 'upgrade';
    row.innerHTML = `
      <div class="upg-info">
        <div class="upg-name">${up.name} <span class="upg-level" data-level></span></div>
        <div class="upg-effect">${up.effectText}</div>
      </div>
      <button class="upg-buy" data-upbuy>σ <span data-upcost></span></button>`;
    shopWrap.appendChild(row);
    const upBtn = row.querySelector('[data-upbuy]');
    upBtn.addEventListener('click', () => handlers.onBuyUpgrade(up.id));
    upgradeEls[up.id] = {
      level: row.querySelector('[data-level]'),
      cost: row.querySelector('[data-upcost]'),
      buy: upBtn,
    };
  }

  els = {
    resources: resourceEls,
    overclockBtn,
    toggleBtns,
    generators: genEls,
    collapse: {
      stc: collapse.querySelector('[data-stc]'),
      sigmaGain: collapse.querySelector('[data-sigmagain]'),
      btn: collapseBtn,
      hint: collapse.querySelector('[data-collapsehint]'),
    },
    shop: root.querySelector('#sigma-shop'),
    sigmaBalance: root.querySelector('#sigma-shop [data-sigma]'),
    upgrades: upgradeEls,
  };
}

// --- Per-frame update (throttles its own work) ------------------------------
export function render(state, now = performance.now()) {
  if (!els) return;
  if (now - lastRender < RENDER_INTERVAL) return;
  lastRender = now;

  const wall = Date.now();

  // Resources
  for (const r of RESOURCES) {
    const e = els.resources[r.id];
    setText(e.amount, format(state.resources[r.id] || 0));
    setText(e.rate, `${format(rateOf(state, r.id, wall))}/s`);
  }

  // Overclock button (three states)
  const oc = overclockStatus(state, wall);
  const ob = els.overclockBtn;
  if (oc.phase === 'active') {
    setText(ob, `OVERCLOCK ×${OVERCLOCK_MULT} — ${oc.seconds}s`);
  } else if (oc.phase === 'cooldown') {
    setText(ob, `Cooling Down — ${oc.seconds}s`);
  } else {
    setText(ob, `Overclock ×${OVERCLOCK_MULT}`);
  }
  setClass(ob, 'active', oc.phase === 'active');
  setClass(ob, 'cooldown', oc.phase === 'cooldown');
  setDisabled(ob, oc.phase !== 'ready');

  // Buy-amount toggle active highlight
  for (const amt of BUY_AMOUNTS) {
    setClass(els.toggleBtns[amt], 'active', state.settings.buyAmount === amt);
  }

  // Generators
  const eff = efficiencyOf(state, wall);
  for (const g of GENERATORS) {
    const e = els.generators[g.id];
    const owned = state.generators[g.id] || 0;
    setText(e.owned, format(owned));

    const out = generatorOutput(state, g, wall);
    const sym = RESOURCE_BY_ID[out.resource].symbol;
    setText(e.each, `+${format(out.rate)} ${sym}/s`);

    if (e.throttle) {
      const pct = Math.round(eff * 100);
      const inputs = Object.entries(g.consumes)
        .map(([res, rate]) => `${format(owned * rate)} ${RESOURCE_BY_ID[res].symbol}`)
        .join(' + ');
      let note = `Consumes ${inputs}/s · ${pct}%`;
      if (owned > 0 && pct < 100) {
        // name the starved input so the balance lesson is legible
        note += eff < 1 ? ` — ${starvedInput(state, g, wall)} starved` : '';
      }
      setText(e.throttle, note);
      setClass(e.throttle, 'starved', owned > 0 && pct < 100);
    }

    const plan = plannedBuy(state, g);
    setText(e.label, `Buy ${state.settings.buyAmount === 'max' ? 'Max' : `×${plan.count}`}`);
    setText(e.cost, format(plan.cost));
    setDisabled(e.buy, !plan.can);
  }

  // Collapse panel
  const gain = sigmaGain(state, wall);
  setText(els.collapse.stc, format(state.structureThisCollapse || 0));
  setText(els.collapse.sigmaGain, format(gain));
  const ready = canCollapse(state);
  setDisabled(els.collapse.btn, !ready);
  setText(els.collapse.hint, ready ? '' : `Need ${format(S_REF)} Structure produced to mint 1 σ.`);

  // Singularity shop — reveal once σ has ever been earned
  const reveal = (state.sigma || 0) > 0 || state.flags.sawSigma ||
    UPGRADES.some((u) => (state.sigmaUpgrades[u.id] || 0) > 0);
  setClass(els.shop, 'hidden', !reveal);
  if (reveal) {
    setText(els.sigmaBalance, format(state.sigma || 0));
    for (const up of UPGRADES) {
      const e = els.upgrades[up.id];
      const level = state.sigmaUpgrades[up.id] || 0;
      const cost = upgradeCost(up, level);
      setText(e.level, `Lv ${level}`);
      setText(e.cost, format(cost));
      setDisabled(e.buy, (state.sigma || 0) < cost);
    }
  }
}

// Which consumed input is the binding constraint (for the "X starved" note).
function starvedInput(state, gen, now) {
  let worst = null;
  let worstRatio = Infinity;
  for (const res in gen.consumes) {
    const demand = (state.generators[gen.id] || 0) * gen.consumes[res];
    if (demand <= 0) continue;
    const ratio = rateOf(state, res, now) / demand;
    if (ratio < worstRatio) { worstRatio = ratio; worst = res; }
  }
  return worst ? RESOURCE_BY_ID[worst].name : 'Input';
}
