// render.js — reads `state` + `content` and updates the DOM. NEVER mutates state.
// Throttled to ~30fps (and skips writes when displayed text is unchanged) to save
// iPhone battery during long idle sessions, even though the sim ticks every frame.
//
// Phase 2: one computeFlow() per frame feeds every readout (resource rates, per-
// converter efficiency, breakdown tooltips). Chain rows / intermediate resources
// reveal as unlockedDepth grows; the Flux panel reveals after the first Collapse.

import { format } from '../engine/format.js';
import { computeFlow, breakdownFor } from '../engine/tick.js';
import { RESOURCES, RESOURCE_BY_ID } from '../content/resources.js';
import { GENERATORS, bulkCost, maxAffordable, isActive } from '../content/generators.js';
import { UPGRADES } from '../content/upgrades.js';
import { sigmaGain, canCollapse, upgradeCost } from '../engine/prestige.js';
import { overclockStatus } from '../engine/overclock.js';
import {
  canOverdrive, canConvergence, canFocus, overdriveActive,
} from '../engine/flux.js';
import {
  S_REF, OVERCLOCK_MULT, FLUX_CAP, SURGE_MULT,
  OVERDRIVE_COST, OVERDRIVE_MULT, OVERDRIVE_DURATION,
  CONVERGENCE_COST, CONVERGENCE_SECONDS,
  SINGULARITY_FOCUS_COST, SINGULARITY_FOCUS_BONUS,
} from '../engine/constants.js';

const RENDER_INTERVAL = 1000 / 30; // ~30fps cap on DOM updates
const BUY_AMOUNTS = [1, 10, 'max'];

// Flux abilities as a small data table so the rows are generic (no per-ability code).
const FLUX_ABILITIES = [
  {
    id: 'overdrive', name: 'Overdrive', cost: OVERDRIVE_COST, handler: 'onOverdrive',
    desc: `×${OVERDRIVE_MULT} all · ${OVERDRIVE_DURATION}s`,
    can: (s, now) => canOverdrive(s, now),
  },
  {
    id: 'convergence', name: 'Convergence', cost: CONVERGENCE_COST, handler: 'onConvergence',
    desc: `Fill stocks to ~${CONVERGENCE_SECONDS}s`,
    can: (s) => canConvergence(s),
  },
  {
    id: 'focus', name: 'Singularity Focus', cost: SINGULARITY_FOCUS_COST, handler: 'onFocus',
    desc: `+${Math.round(SINGULARITY_FOCUS_BONUS * 100)}% σ next Collapse`,
    can: (s) => canFocus(s),
  },
];

let lastRender = 0;
const lastText = new Map(); // element -> last written string, to skip no-op writes
const expanded = new Set(); // resourceIds whose breakdown tooltip is open
let els = null;             // cached DOM references, built once on init
let handlers = null;

function setText(el, text) {
  if (!el) return;
  if (lastText.get(el) === text) return;
  lastText.set(el, text);
  el.textContent = text;
}

function setHTML(el, html) {
  if (!el) return;
  if (lastText.get(el) === html) return;
  lastText.set(el, html);
  el.innerHTML = html;
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
// Semantics match buy(): "up to the chosen count OR as many as affordable".
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

  // Resources — each card's rate is tap-to-expand for an itemized breakdown.
  const resourceWrap = root.querySelector('#resources');
  const resourceEls = {};
  for (const r of RESOURCES) {
    const card = document.createElement('div');
    card.className = 'resource';
    card.innerHTML = `
      <div class="resource-name">${r.name}</div>
      <div class="resource-amount" data-amount></div>
      <button class="resource-rate" data-rate aria-label="Show ${r.name} breakdown"></button>
      <div class="breakdown hidden" data-breakdown></div>`;
    resourceWrap.appendChild(card);
    const rateBtn = card.querySelector('[data-rate]');
    rateBtn.addEventListener('click', () => {
      if (expanded.has(r.id)) expanded.delete(r.id); else expanded.add(r.id);
    });
    resourceEls[r.id] = {
      card,
      amount: card.querySelector('[data-amount]'),
      rate: rateBtn,
      breakdown: card.querySelector('[data-breakdown]'),
    };
  }

  // Overclock button
  const overclockBtn = root.querySelector('#overclock-btn');
  overclockBtn.addEventListener('click', () => handlers.onOverclock());

  // Flux ability rows
  const fluxWrap = root.querySelector('#flux-abilities');
  const fluxEls = {};
  for (const ab of FLUX_ABILITIES) {
    const row = document.createElement('div');
    row.className = 'flux-ability';
    row.innerHTML = `
      <div class="fa-info">
        <div class="fa-name">${ab.name} <span class="fa-status" data-fastatus></span></div>
        <div class="fa-desc">${ab.desc}</div>
      </div>
      <button class="fa-buy" data-fabuy>${format(ab.cost)} ⚡</button>`;
    fluxWrap.appendChild(row);
    row.querySelector('[data-fabuy]').addEventListener('click', () => handlers[ab.handler]());
    fluxEls[ab.id] = {
      buy: row.querySelector('[data-fabuy]'),
      status: row.querySelector('[data-fastatus]'),
    };
  }

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

  // Generators (producers + the converter ladder; converters reveal as unlocked).
  const genWrap = root.querySelector('#generators');
  const genEls = {};
  for (const g of GENERATORS) {
    const row = document.createElement('div');
    row.className = 'generator';
    // Every converter (anything with `consumes`) shows a throttle / efficiency line.
    const consumeLine = g.consumes ? `<div class="gen-throttle" data-throttle></div>` : '';
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
    row.querySelector('[data-buy]').addEventListener('click', () => handlers.onBuy(g.id));
    genEls[g.id] = {
      row,
      owned: row.querySelector('[data-owned]'),
      each: row.querySelector('[data-each]'),
      throttle: row.querySelector('[data-throttle]'),
      cost: row.querySelector('[data-cost]'),
      label: row.querySelector('[data-buylabel]'),
      buy: row.querySelector('[data-buy]'),
    };
  }

  // Collapse panel
  const collapse = root.querySelector('#collapse-panel');
  collapse.innerHTML = `
    <div class="panel-head"><h2>Collapse</h2></div>
    <p class="panel-desc">Reset this Scale's production to mint <strong>Singularity (σ)</strong>.
      σ, its upgrades, and your unlocked tiers persist; the factory resets.</p>
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
    row.querySelector('[data-upbuy]').addEventListener('click', () => handlers.onBuyUpgrade(up.id));
    upgradeEls[up.id] = {
      level: row.querySelector('[data-level]'),
      cost: row.querySelector('[data-upcost]'),
      buy: row.querySelector('[data-upbuy]'),
    };
  }

  els = {
    resources: resourceEls,
    overclockBtn,
    flux: {
      section: root.querySelector('#flux-section'),
      amount: root.querySelector('#flux-section [data-flux]'),
      fill: root.querySelector('[data-fluxfill]'),
      abilities: fluxEls,
    },
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
  const depth = state.unlockedDepth || 0;
  const flow = computeFlow(state, wall); // single steady-state read for the whole frame

  // Resources — hidden until the chain is deep enough to produce them.
  for (const r of RESOURCES) {
    const e = els.resources[r.id];
    const visible = depth >= (r.revealDepth || 0);
    setClass(e.card, 'hidden', !visible);
    if (!visible) continue;
    setText(e.amount, format(state.resources[r.id] || 0));
    setText(e.rate, `${format(flow.supply[r.id] || 0)}/s`);
    renderBreakdown(state, r, e, wall, flow);
  }

  // Overclock button (three states)
  const oc = overclockStatus(state, wall);
  const ob = els.overclockBtn;
  if (oc.phase === 'active') setText(ob, `OVERCLOCK ×${OVERCLOCK_MULT} — ${oc.seconds}s`);
  else if (oc.phase === 'cooldown') setText(ob, `Cooling Down — ${oc.seconds}s`);
  else setText(ob, `Overclock ×${OVERCLOCK_MULT}`);
  setClass(ob, 'active', oc.phase === 'active');
  setClass(ob, 'cooldown', oc.phase === 'cooldown');
  setDisabled(ob, oc.phase !== 'ready');

  renderFlux(state, wall);

  // Buy-amount toggle active highlight
  for (const amt of BUY_AMOUNTS) {
    setClass(els.toggleBtns[amt], 'active', state.settings.buyAmount === amt);
  }

  // Generators — converter rows reveal as their tier unlocks.
  for (const g of GENERATORS) {
    const e = els.generators[g.id];
    const active = isActive(g, depth);
    setClass(e.row, 'hidden', !active);
    if (!active) continue;

    const owned = state.generators[g.id] || 0;
    setText(e.owned, format(owned));

    const out = flow.gens[g.id];
    const sym = RESOURCE_BY_ID[out.resource].symbol;
    setText(e.each, `+${format(out.rate)} ${sym}/s`);

    if (e.throttle) {
      const eff = out.eff;
      const pct = Math.round(eff * 100);
      const inputs = Object.entries(g.consumes)
        .map(([res, rate]) => `${format(owned * rate)} ${RESOURCE_BY_ID[res].symbol}`)
        .join(' + ');
      let note = `Consumes ${inputs}/s · ${pct}%`;
      const starved = owned > 0 && eff < 1;
      if (starved) note += ` — ${starvedInput(g, flow)} starved`;
      setText(e.throttle, note);
      setClass(e.throttle, 'starved', starved);
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

// Flux meter + ability buttons. Revealed after the first Collapse so minute-one
// stays uncluttered (Flux quietly accrues before then).
function renderFlux(state, now) {
  const reveal = !!state.flags.sawSigma;
  setClass(els.flux.section, 'hidden', !reveal);
  if (!reveal) return;

  const flux = state.flux || 0;
  setText(els.flux.amount, `${Math.floor(flux)} / ${FLUX_CAP} ⚡`);
  const fill = els.flux.fill;
  const pct = `${Math.max(0, Math.min(100, (flux / FLUX_CAP) * 100)).toFixed(1)}%`;
  if (fill.style.width !== pct) fill.style.width = pct;

  for (const ab of FLUX_ABILITIES) {
    const e = els.flux.abilities[ab.id];
    setDisabled(e.buy, !ab.can(state, now));
    // Status hint: active timer / armed flag for the relevant abilities.
    let status = '';
    if (ab.id === 'overdrive' && overdriveActive(state, now)) {
      status = `active ${Math.ceil((state.overdriveEndsAt - now) / 1000)}s`;
    } else if (ab.id === 'focus' && state.singularityFocusArmed) {
      status = 'armed';
    }
    setText(e.status, status);
  }
}

// Itemized production breakdown tooltip (tap-to-expand; no hover on touch).
function renderBreakdown(state, r, e, now, flow) {
  const open = expanded.has(r.id);
  setClass(e.breakdown, 'hidden', !open);
  setClass(e.rate, 'open', open);
  if (!open) return;

  const b = breakdownFor(state, r.id, now, flow);
  const rows = [`<div class="bd-row"><span>Base</span><span>+${format(b.base)}/s</span></div>`];
  for (const it of b.items) {
    rows.push(`<div class="bd-row"><span>${it.source}</span><span>×${it.factor.toFixed(2)}</span></div>`);
  }
  if (b.throttled) {
    rows.push(`<div class="bd-row"><span>Efficiency</span><span>${Math.round(b.eff * 100)}%</span></div>`);
  }
  rows.push(`<div class="bd-row bd-total"><span>Effective</span><span>+${format(b.rate)}/s</span></div>`);
  setHTML(e.breakdown, rows.join(''));
}

// Which consumed input is the binding constraint (for the "X starved" note).
function starvedInput(gen, flow) {
  let worst = null;
  let worstRatio = Infinity;
  for (const res in gen.consumes) {
    const demand = flow.gens[gen.id].owned * gen.consumes[res];
    if (demand <= 0) continue;
    const ratio = (flow.supply[res] || 0) / demand;
    if (ratio < worstRatio) { worstRatio = ratio; worst = res; }
  }
  return worst ? RESOURCE_BY_ID[worst].name : 'Input';
}
