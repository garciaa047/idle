// render.js — reads `state` + `content` and updates the DOM. NEVER mutates state.
// Throttled to ~30fps (and skips writes when displayed text is unchanged) to save
// iPhone battery during long idle sessions, even though the sim ticks every frame.
//
// Phase 3: everything is read from the CURRENT Scale via the scales.js accessors.
// Because structural ids are stable across Scales, the DOM skeleton is built once
// (from Scale 1) and only the DISPLAY names/symbols/theme update per frame — so
// entering Scale 2 visibly re-themes without a rebuild.

import { format } from '../engine/format.js';
import { computeFlow, breakdownFor } from '../engine/tick.js';
import { isActive, bulkCost, maxAffordable } from '../content/generators.js';
import {
  SCALES, SCALE_ROADMAP, scaleOf, resourcesOf, generatorsOf, upgradesOf, hasNextScale,
} from '../content/scales.js';
import { AEON_UPGRADES, aeonLevel } from '../content/aeon.js';
import { sigmaGain, canCollapse, upgradeCost } from '../engine/prestige.js';
import { canAscend, ascendGain } from '../engine/ascend.js';
import { overclockStatus } from '../engine/overclock.js';
import { canOverdrive, canConvergence, canFocus, overdriveActive } from '../engine/flux.js';
import {
  CACHE_VERSION, S_REF, ASCEND_SIGMA_REQ, OVERCLOCK_MULT, FLUX_CAP,
  OVERDRIVE_COST, OVERDRIVE_MULT, OVERDRIVE_DURATION,
  CONVERGENCE_COST, CONVERGENCE_SECONDS,
  SINGULARITY_FOCUS_COST, SINGULARITY_FOCUS_BONUS,
} from '../engine/constants.js';

const RENDER_INTERVAL = 1000 / 30;
const BUY_AMOUNTS = [1, 10, 'max'];
const SCALE1 = SCALES[0]; // the stable id skeleton (all Scales share these ids)

const FLUX_ABILITIES = [
  {
    id: 'overdrive', name: 'Overdrive', cost: OVERDRIVE_COST, handler: 'onOverdrive',
    desc: `×${OVERDRIVE_MULT} all · ${OVERDRIVE_DURATION}s`, can: (s, now) => canOverdrive(s, now),
  },
  {
    id: 'convergence', name: 'Convergence', cost: CONVERGENCE_COST, handler: 'onConvergence',
    desc: `Fill stocks to ~${CONVERGENCE_SECONDS}s`, can: (s) => canConvergence(s),
  },
  {
    id: 'focus', name: 'Singularity Focus', cost: SINGULARITY_FOCUS_COST, handler: 'onFocus',
    desc: `+${Math.round(SINGULARITY_FOCUS_BONUS * 100)}% σ next Collapse`, can: (s) => canFocus(s),
  },
];

let lastRender = 0;
const lastText = new Map();
const expanded = new Set();
let lastThemeScale = -1;
let els = null;
let handlers = null;

function setText(el, text) {
  if (!el || lastText.get(el) === text) return;
  lastText.set(el, text);
  el.textContent = text;
}
function setHTML(el, html) {
  if (!el || lastText.get(el) === html) return;
  lastText.set(el, html);
  el.innerHTML = html;
}
function setDisabled(el, d) { if (el && el.disabled !== d) el.disabled = d; }
function setClass(el, cls, on) { if (el && el.classList.contains(cls) !== on) el.classList.toggle(cls, on); }

function plannedBuy(state, gen) {
  const owned = state.generators[gen.id] || 0;
  const budget = state.resources[gen.costResource] || 0;
  const amt = state.settings.buyAmount;
  const affordable = maxAffordable(gen, owned, budget);
  const nominal = amt === 'max' ? affordable : Math.min(amt, affordable);
  const count = Math.max(1, nominal);
  return { count, cost: bulkCost(gen, owned, count), can: affordable >= 1 };
}

// --- Build the static DOM skeleton once (from Scale 1's stable ids) ----------
export function initRender(root, h) {
  handlers = h;

  // Resources
  const resourceWrap = root.querySelector('#resources');
  const resourceEls = {};
  for (const r of SCALE1.resources) {
    const card = document.createElement('div');
    card.className = 'resource';
    card.innerHTML = `
      <div class="resource-name" data-name></div>
      <div class="resource-amount" data-amount></div>
      <button class="resource-rate" data-rate aria-label="Show breakdown"></button>
      <div class="breakdown hidden" data-breakdown></div>`;
    resourceWrap.appendChild(card);
    card.querySelector('[data-rate]').addEventListener('click', () => {
      if (expanded.has(r.id)) expanded.delete(r.id); else expanded.add(r.id);
    });
    resourceEls[r.id] = {
      card,
      name: card.querySelector('[data-name]'),
      amount: card.querySelector('[data-amount]'),
      rate: card.querySelector('[data-rate]'),
      breakdown: card.querySelector('[data-breakdown]'),
    };
  }

  const overclockBtn = root.querySelector('#overclock-btn');
  overclockBtn.addEventListener('click', () => handlers.onOverclock());

  // Flux abilities
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
    fluxEls[ab.id] = { buy: row.querySelector('[data-fabuy]'), status: row.querySelector('[data-fastatus]') };
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

  // Generators
  const genWrap = root.querySelector('#generators');
  const genEls = {};
  for (const g of SCALE1.ladder) {
    const row = document.createElement('div');
    row.className = 'generator';
    const consumeLine = g.consumes ? `<div class="gen-throttle" data-throttle></div>` : '';
    row.innerHTML = `
      <div class="gen-info">
        <div class="gen-name" data-genname>${g.name}</div>
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
      name: row.querySelector('[data-genname]'),
      owned: row.querySelector('[data-owned]'),
      each: row.querySelector('[data-each]'),
      throttle: row.querySelector('[data-throttle]'),
      cost: row.querySelector('[data-cost]'),
      label: row.querySelector('[data-buylabel]'),
      buy: row.querySelector('[data-buy]'),
    };
  }

  // Automator panel
  const autoMaster = root.querySelector('[data-auto-master]');
  autoMaster.addEventListener('click', () => handlers.onAutoMaster());
  const autoGenWrap = root.querySelector('#auto-gens');
  const autoGenEls = {};
  for (const g of SCALE1.ladder) {
    const row = document.createElement('div');
    row.className = 'auto-row auto-gen';
    row.innerHTML = `<span data-autoname>${g.name}</span><button class="auto-toggle" data-autotoggle>Off</button>`;
    autoGenWrap.appendChild(row);
    row.querySelector('[data-autotoggle]').addEventListener('click', () => handlers.onAutoGen(g.id));
    autoGenEls[g.id] = {
      row, name: row.querySelector('[data-autoname]'), toggle: row.querySelector('[data-autotoggle]'),
    };
  }
  const reserveSlider = root.querySelector('[data-reserve]');
  reserveSlider.addEventListener('input', () => handlers.onAutoReserve(Number(reserveSlider.value)));
  const cheapestBox = root.querySelector('[data-cheapest]');
  cheapestBox.addEventListener('change', () => handlers.onAutoCheapest(cheapestBox.checked));

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
  collapse.querySelector('[data-collapse]').addEventListener('click', () => handlers.onCollapse());

  // Singularity shop
  const shopWrap = root.querySelector('#sigma-upgrades');
  const upgradeEls = {};
  for (const up of SCALE1.sigma.upgrades) {
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
    upgradeEls[up.id] = { level: row.querySelector('[data-level]'), cost: row.querySelector('[data-upcost]'), buy: row.querySelector('[data-upbuy]') };
  }

  // Ascend panel
  root.querySelector('[data-ascend]').addEventListener('click', () => handlers.onAscend());

  // Aeon shop
  const aeonWrap = root.querySelector('#aeon-upgrades');
  const aeonEls = {};
  for (const up of AEON_UPGRADES) {
    const row = document.createElement('div');
    row.className = 'upgrade aeon-upgrade';
    row.innerHTML = `
      <div class="upg-info">
        <div class="upg-name">${up.name} <span class="upg-level" data-level></span></div>
        <div class="upg-effect">${up.effectText}</div>
      </div>
      <button class="upg-buy aeon-buy" data-aeonbuy>Æ <span data-aeoncost></span></button>`;
    aeonWrap.appendChild(row);
    row.querySelector('[data-aeonbuy]').addEventListener('click', () => handlers.onBuyAeon(up.id));
    aeonEls[up.id] = { level: row.querySelector('[data-level]'), cost: row.querySelector('[data-aeoncost]'), buy: row.querySelector('[data-aeonbuy]') };
  }

  // Scale roadmap
  const roadmapWrap = root.querySelector('#roadmap-list');
  const roadmapEls = [];
  SCALE_ROADMAP.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'roadmap-row';
    row.innerHTML = `<span class="rm-num">${i + 1}</span><span class="rm-name" data-rmname>${name}</span><span class="rm-tag" data-rmtag></span>`;
    roadmapWrap.appendChild(row);
    roadmapEls.push({ row, name: row.querySelector('[data-rmname]'), tag: row.querySelector('[data-rmtag]') });
  });

  // Version badge (shows the active CACHE_VERSION; updates if the constant changes)
  setText(root.querySelector('[data-version]'), CACHE_VERSION);

  els = {
    root,
    scaleNum: root.querySelector('[data-scale-num]'),
    scaleName: root.querySelector('[data-scale-name]'),
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
    automator: {
      panel: root.querySelector('#automator-panel'),
      master: autoMaster,
      gens: autoGenEls,
      reserveSlider,
      reserveVal: root.querySelector('[data-reserve-val]'),
      cheapestRow: root.querySelector('[data-cheapest-row]'),
      cheapestBox,
    },
    collapse: {
      stc: collapse.querySelector('[data-stc]'),
      sigmaGain: collapse.querySelector('[data-sigmagain]'),
      btn: collapse.querySelector('[data-collapse]'),
      hint: collapse.querySelector('[data-collapsehint]'),
    },
    shop: root.querySelector('#sigma-shop'),
    sigmaBalance: root.querySelector('#sigma-shop [data-sigma]'),
    upgrades: upgradeEls,
    ascend: {
      panel: root.querySelector('#ascend-panel'),
      nextScale: root.querySelector('[data-next-scale]'),
      gain: root.querySelector('[data-aeongain]'),
      btn: root.querySelector('[data-ascend]'),
      hint: root.querySelector('[data-ascendhint]'),
    },
    aeon: {
      panel: root.querySelector('#aeon-shop'),
      balance: root.querySelector('#aeon-shop [data-aeon]'),
      upgrades: aeonEls,
    },
    roadmap: roadmapEls,
  };
}

// --- Per-frame update --------------------------------------------------------
export function render(state, now = performance.now()) {
  if (!els) return;
  if (now - lastRender < RENDER_INTERVAL) return;
  lastRender = now;

  const wall = Date.now();
  const depth = state.unlockedDepth || 0;
  const scale = scaleOf(state);
  const flow = computeFlow(state, wall);
  const resById = {};
  for (const r of scale.resources) resById[r.id] = r;

  // Scale banner + per-Scale theme (light visual shift via CSS vars)
  setText(els.scaleNum, String(state.currentScale || 1));
  setText(els.scaleName, scale.name);
  if (scale.theme && lastThemeScale !== scale.id) {
    document.documentElement.style.setProperty('--accent', scale.theme.accent);
    document.documentElement.style.setProperty('--accent-2', scale.theme.accent2);
    lastThemeScale = scale.id;
  }

  // Resources (re-themed names; hidden until the chain is deep enough)
  for (const r of scale.resources) {
    const e = els.resources[r.id];
    const visible = depth >= (r.revealDepth || 0);
    setClass(e.card, 'hidden', !visible);
    if (!visible) continue;
    setText(e.name, r.name);
    setText(e.amount, format(state.resources[r.id] || 0));
    setText(e.rate, `${format(flow.supply[r.id] || 0)}/s`);
    renderBreakdown(state, r, e, wall, flow);
  }

  // Overclock
  const oc = overclockStatus(state, wall);
  const ob = els.overclockBtn;
  if (oc.phase === 'active') setText(ob, `OVERCLOCK ×${OVERCLOCK_MULT} — ${oc.seconds}s`);
  else if (oc.phase === 'cooldown') setText(ob, `Cooling Down — ${oc.seconds}s`);
  else setText(ob, `Overclock ×${OVERCLOCK_MULT}`);
  setClass(ob, 'active', oc.phase === 'active');
  setClass(ob, 'cooldown', oc.phase === 'cooldown');
  setDisabled(ob, oc.phase !== 'ready');

  renderFlux(state, wall);

  for (const amt of BUY_AMOUNTS) setClass(els.toggleBtns[amt], 'active', state.settings.buyAmount === amt);

  // Generators (re-themed names; converter rows reveal as their tier unlocks)
  for (const g of scale.ladder) {
    const e = els.generators[g.id];
    const active = isActive(g, depth);
    setClass(e.row, 'hidden', !active);
    if (!active) continue;
    setText(e.name, g.name);
    const owned = state.generators[g.id] || 0;
    setText(e.owned, format(owned));

    const out = flow.gens[g.id];
    setText(e.each, `+${format(out.rate)} ${resById[out.resource].symbol}/s`);

    if (e.throttle) {
      const eff = out.eff;
      const pct = Math.round(eff * 100);
      const inputs = Object.entries(g.consumes)
        .map(([res, rate]) => `${format(owned * rate)} ${resById[res].symbol}`)
        .join(' + ');
      let note = `Consumes ${inputs}/s · ${pct}%`;
      const starved = owned > 0 && eff < 1;
      if (starved) note += ` — ${starvedInput(g, flow, resById)} starved`;
      setText(e.throttle, note);
      setClass(e.throttle, 'starved', starved);
    }

    const plan = plannedBuy(state, g);
    setText(e.label, `Buy ${state.settings.buyAmount === 'max' ? 'Max' : `×${plan.count}`}`);
    setText(e.cost, format(plan.cost));
    setDisabled(e.buy, !plan.can);
  }

  renderAutomator(state, scale, depth);

  // Collapse panel
  setText(els.collapse.stc, format(state.structureThisCollapse || 0));
  setText(els.collapse.sigmaGain, format(sigmaGain(state, wall)));
  const ready = canCollapse(state);
  setDisabled(els.collapse.btn, !ready);
  setText(els.collapse.hint, ready ? '' : `Need ${format(S_REF)} Structure produced to mint 1 σ.`);

  // Singularity shop
  const reveal = (state.sigma || 0) > 0 || state.flags.sawSigma ||
    upgradesOf(state).some((u) => (state.sigmaUpgrades[u.id] || 0) > 0);
  setClass(els.shop, 'hidden', !reveal);
  if (reveal) {
    setText(els.sigmaBalance, format(state.sigma || 0));
    for (const up of upgradesOf(state)) {
      const e = els.upgrades[up.id];
      const level = state.sigmaUpgrades[up.id] || 0;
      const cost = upgradeCost(up, level);
      setText(e.level, `Lv ${level}`);
      setText(e.cost, format(cost));
      setDisabled(e.buy, (state.sigma || 0) < cost);
    }
  }

  renderAscend(state);
  renderAeon(state);
  renderRoadmap(state);
}

function renderFlux(state, now) {
  const reveal = !!state.flags.sawSigma;
  setClass(els.flux.section, 'hidden', !reveal);
  if (!reveal) return;
  const flux = state.flux || 0;
  setText(els.flux.amount, `${Math.floor(flux)} / ${FLUX_CAP} ⚡`);
  const pct = `${Math.max(0, Math.min(100, (flux / FLUX_CAP) * 100)).toFixed(1)}%`;
  if (els.flux.fill.style.width !== pct) els.flux.fill.style.width = pct;
  for (const ab of FLUX_ABILITIES) {
    const e = els.flux.abilities[ab.id];
    setDisabled(e.buy, !ab.can(state, now));
    let status = '';
    if (ab.id === 'overdrive' && overdriveActive(state, now)) status = `active ${Math.ceil((state.overdriveEndsAt - now) / 1000)}s`;
    else if (ab.id === 'focus' && state.singularityFocusArmed) status = 'armed';
    setText(e.status, status);
  }
}

function renderAutomator(state, scale, depth) {
  const a = state.automator;
  setClass(els.automator.panel, 'hidden', !a.unlocked);
  if (!a.unlocked) return;
  setText(els.automator.master, a.master ? 'On' : 'Off');
  setClass(els.automator.master, 'on', a.master);
  for (const g of scale.ladder) {
    const e = els.automator.gens[g.id];
    const active = isActive(g, depth);
    setClass(e.row, 'hidden', !active);
    if (!active) continue;
    setText(e.name, g.name);
    const on = !!a.perGen[g.id];
    setText(e.toggle, on ? 'On' : 'Off');
    setClass(e.toggle, 'on', on);
  }
  setText(els.automator.reserveVal, String(a.reservePct || 0));
  if (els.automator.reserveSlider.value !== String(a.reservePct || 0)) {
    els.automator.reserveSlider.value = String(a.reservePct || 0);
  }
  // "Buy cheapest" only once Automation Matrix is purchased.
  const matrix = aeonLevel(state, 'automationMatrix');
  setClass(els.automator.cheapestRow, 'hidden', matrix < 1);
  if (els.automator.cheapestBox.checked !== !!a.buyCheapest) els.automator.cheapestBox.checked = !!a.buyCheapest;
}

function renderAscend(state) {
  // Reveal once the gate has ever been met (latched via sawAscend) so it stays
  // visible even after a reset closes the gate.
  const reveal = state.flags.sawAscend && hasNextScale(state);
  setClass(els.ascend.panel, 'hidden', !reveal);
  if (!reveal) return;
  const next = SCALES[(state.currentScale || 1)]; // next Scale def (index = currentScale)
  setText(els.ascend.nextScale, next ? next.name : '—');
  setText(els.ascend.gain, format(ascendGain(state)));
  const ready = canAscend(state);
  setDisabled(els.ascend.btn, !ready);
  if (ready) {
    setText(els.ascend.hint, '');
  } else if ((state.unlockedDepth || 0) < 3) {
    setText(els.ascend.hint, 'Fully deepen the chain (reach the top tier) to Ascend.');
  } else {
    setText(els.ascend.hint, `Earn ${format(ASCEND_SIGMA_REQ)} σ this Scale to Ascend (${format(state.sigmaThisScale || 0)} so far).`);
  }
}

function renderAeon(state) {
  const reveal = state.flags.sawAscend || (state.aeons || 0) > 0;
  setClass(els.aeon.panel, 'hidden', !reveal);
  if (!reveal) return;
  setText(els.aeon.balance, format(state.aeons || 0));
  for (const up of AEON_UPGRADES) {
    const e = els.aeon.upgrades[up.id];
    const level = aeonLevel(state, up.id);
    const cost = up.cost(level);
    setText(e.level, `Lv ${level}`);
    setText(e.cost, format(cost));
    setDisabled(e.buy, (state.aeons || 0) < cost);
  }
}

function renderRoadmap(state) {
  const cur = state.currentScale || 1;
  els.roadmap.forEach((e, i) => {
    const num = i + 1;
    const defined = num <= SCALES.length;
    setText(e.name, defined ? SCALES[i].name : '???');
    let tag = '';
    if (num === cur) tag = 'Current';
    else if (num < cur) tag = 'Done';
    else if (!defined) tag = 'Locked';
    setText(e.tag, tag);
    setClass(e.row, 'rm-current', num === cur);
    setClass(e.row, 'rm-locked', num > cur);
  });
}

function renderBreakdown(state, r, e, now, flow) {
  const open = expanded.has(r.id);
  setClass(e.breakdown, 'hidden', !open);
  setClass(e.rate, 'open', open);
  if (!open) return;
  const b = breakdownFor(state, r.id, now, flow);
  const rows = [`<div class="bd-row"><span>Base</span><span>+${format(b.base)}/s</span></div>`];
  for (const it of b.items) rows.push(`<div class="bd-row"><span>${it.source}</span><span>×${it.factor.toFixed(2)}</span></div>`);
  if (b.throttled) rows.push(`<div class="bd-row"><span>Efficiency</span><span>${Math.round(b.eff * 100)}%</span></div>`);
  rows.push(`<div class="bd-row bd-total"><span>Effective</span><span>+${format(b.rate)}/s</span></div>`);
  setHTML(e.breakdown, rows.join(''));
}

function starvedInput(gen, flow, resById) {
  let worst = null;
  let worstRatio = Infinity;
  for (const res in gen.consumes) {
    const demand = flow.gens[gen.id].owned * gen.consumes[res];
    if (demand <= 0) continue;
    const ratio = (flow.supply[res] || 0) / demand;
    if (ratio < worstRatio) { worstRatio = ratio; worst = res; }
  }
  return worst ? resById[worst].name : 'Input';
}
