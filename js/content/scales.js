// scales.js — THE DATA-DRIVEN SCALE SYSTEM (Phase 3).
//
// This is the payoff of the Phase 0 mandate: the engine, simulation, throttling,
// multiplier system, Collapse, Overclock, Resonance and Flux are all Scale-AGNOSTIC.
// Everything that differs between Scales lives here as DATA. The engine reads
// `scaleOf(state)` for the active Scale's definitions; adding Scale 3..7 later is a
// pure data edit (append an entry built by the same factories below).
//
// A Scale definition:
//   { id, name, theme, resources[], ladder[], chainUnlocks[], sigma{K_SIGMA,S_REF,upgrades[]},
//     unlockThresholds[] }
//
// KEY INVARIANT: structural ids are STABLE across Scales — the score/currency
// resource is always `structure`, the producers are `reactor`/`extractor`, the
// converter ids are `fabricator`/`assembler`/`synthesizer`/`integrator`. Only the
// DISPLAY names/symbols, theme, and (later) numeric tuning vary per Scale. Because
// the ids are stable, no engine code or save key is ever Scale-specific, and the
// within-Scale state carries cleanly through the σ-reset on Ascend.

import {
  REACTOR_BASE_COST, REACTOR_COST_GROWTH, REACTOR_RATE,
  EXTRACTOR_BASE_COST, EXTRACTOR_COST_GROWTH, EXTRACTOR_RATE,
  FABRICATOR_BASE_COST, FABRICATOR_COST_GROWTH, FABRICATOR_RATE,
  FABRICATOR_CONSUME_ENERGY, FABRICATOR_CONSUME_MATTER,
  ASSEMBLER_BASE_COST, ASSEMBLER_COST_GROWTH,
  SYNTHESIZER_BASE_COST, SYNTHESIZER_COST_GROWTH,
  INTEGRATOR_BASE_COST, INTEGRATOR_COST_GROWTH,
  TIER_MULT, UNLOCK_THRESHOLDS,
  K_SIGMA, S_REF,
  UP_FAB_YIELD_FACTOR, UP_THROUGHPUT_FACTOR, UP_RESONANCE_FACTOR, UP_COLLAPSE_YIELD_STEP,
  UP_FAB_YIELD_COST, UP_THROUGHPUT_COST, UP_RESONANCE_COST, UP_COLLAPSE_YIELD_COST,
} from '../engine/constants.js';

// --- σ-shop upgrades (Collapse currency) ------------------------------------
// Shared shape across Scales for now (Scale 2 is "re-themed, re-tuned only"). ids
// are stable, so state.sigmaUpgrades survives every σ-reset/Ascend without churn.
const SIGMA_UPGRADES = [
  {
    id: 'fabricationYield',
    name: 'Fabrication Yield',
    effectText: `×${UP_FAB_YIELD_FACTOR.toFixed(2)} Structure / level`,
    cost: (level) => UP_FAB_YIELD_COST[0] * Math.pow(UP_FAB_YIELD_COST[1], level),
    contributions: (level) => [{ target: 'structure', factor: Math.pow(UP_FAB_YIELD_FACTOR, level) }],
  },
  {
    id: 'throughput',
    name: 'Throughput',
    effectText: `×${UP_THROUGHPUT_FACTOR.toFixed(2)} raw inputs / level`,
    cost: (level) => UP_THROUGHPUT_COST[0] * Math.pow(UP_THROUGHPUT_COST[1], level),
    contributions: (level) => [
      { target: 'energy', factor: Math.pow(UP_THROUGHPUT_FACTOR, level) },
      { target: 'matter', factor: Math.pow(UP_THROUGHPUT_FACTOR, level) },
    ],
  },
  {
    id: 'resonance',
    name: 'Resonance',
    effectText: `×${UP_RESONANCE_FACTOR.toFixed(2)} ALL production / level`,
    cost: (level) => UP_RESONANCE_COST[0] * Math.pow(UP_RESONANCE_COST[1], level),
    contributions: (level) => [{ target: 'all', factor: Math.pow(UP_RESONANCE_FACTOR, level) }],
  },
  {
    id: 'collapseYield',
    name: 'Collapse Yield',
    effectText: `+${Math.round(UP_COLLAPSE_YIELD_STEP * 100)}% σ on Collapse / level`,
    cost: (level) => UP_COLLAPSE_YIELD_COST[0] * Math.pow(UP_COLLAPSE_YIELD_COST[1], level),
    contributions: (level) => [{ target: 'sigmaGain', factor: 1 + UP_COLLAPSE_YIELD_STEP * level }],
  },
];

// --- Factories: build a Scale's resources/ladder/unlocks from display names ---
// They reuse the SAME tuning constants for every Scale, so Scale 2 is balanced by
// construction — the acceleration comes from carried Aeon upgrades + the Automator,
// not from re-tuning. (Per-Scale tuning can diverge in later phases by passing
// different numbers here.)

// `names`: { energy, matter, components, modules, engines, structure } -> { n, s } (name, symbol).
function buildResources(names) {
  return [
    { id: 'energy', name: names.energy.n, symbol: names.energy.s, revealDepth: 0 },
    { id: 'matter', name: names.matter.n, symbol: names.matter.s, revealDepth: 0 },
    { id: 'components', name: names.components.n, symbol: names.components.s, revealDepth: 1 },
    { id: 'modules', name: names.modules.n, symbol: names.modules.s, revealDepth: 2 },
    { id: 'engines', name: names.engines.n, symbol: names.engines.s, revealDepth: 3 },
    { id: 'structure', name: names.structure.n, symbol: names.structure.s, revealDepth: 0 },
  ];
}

// `conv`: { reactor, extractor, fabricator, assembler, synthesizer, integrator } -> display name.
function buildLadder(conv) {
  return [
    {
      id: 'reactor', name: conv.reactor, costResource: 'structure',
      baseCost: REACTOR_BASE_COST, costGrowth: REACTOR_COST_GROWTH,
      produces: { energy: REACTOR_RATE },
    },
    {
      id: 'extractor', name: conv.extractor, costResource: 'structure',
      baseCost: EXTRACTOR_BASE_COST, costGrowth: EXTRACTOR_COST_GROWTH,
      produces: { matter: EXTRACTOR_RATE },
    },
    {
      id: 'fabricator', name: conv.fabricator, costResource: 'structure',
      baseCost: FABRICATOR_BASE_COST, costGrowth: FABRICATOR_COST_GROWTH,
      chainIndex: 0, tierResource: 'components', rate: FABRICATOR_RATE,
      consumes: { energy: FABRICATOR_CONSUME_ENERGY, matter: FABRICATOR_CONSUME_MATTER },
    },
    {
      id: 'assembler', name: conv.assembler, costResource: 'structure',
      baseCost: ASSEMBLER_BASE_COST, costGrowth: ASSEMBLER_COST_GROWTH,
      chainIndex: 1, tierResource: 'modules', rate: TIER_MULT,
      consumes: { components: 1 },
    },
    {
      id: 'synthesizer', name: conv.synthesizer, costResource: 'structure',
      baseCost: SYNTHESIZER_BASE_COST, costGrowth: SYNTHESIZER_COST_GROWTH,
      chainIndex: 2, tierResource: 'engines', rate: TIER_MULT,
      consumes: { modules: 1 },
    },
    {
      id: 'integrator', name: conv.integrator, costResource: 'structure',
      baseCost: INTEGRATOR_BASE_COST, costGrowth: INTEGRATOR_COST_GROWTH,
      chainIndex: 3, tierResource: 'structure', rate: TIER_MULT,
      consumes: { engines: 1 },
    },
  ];
}

function buildChainUnlocks(names, conv) {
  return [
    {
      depth: 1, threshold: UNLOCK_THRESHOLDS[0], resource: 'components', converter: 'assembler',
      blurb: `${conv.fabricator}s now refine raw input into ${names.components.n}; ${conv.assembler}s forge them into ${names.structure.n}.`,
    },
    {
      depth: 2, threshold: UNLOCK_THRESHOLDS[1], resource: 'modules', converter: 'synthesizer',
      blurb: `${conv.assembler}s now build ${names.modules.n}; ${conv.synthesizer}s forge them into ${names.structure.n}.`,
    },
    {
      depth: 3, threshold: UNLOCK_THRESHOLDS[2], resource: 'engines', converter: 'integrator',
      blurb: `${conv.synthesizer}s now build ${names.engines.n}; ${conv.integrator}s forge them into ${names.structure.n}.`,
    },
  ];
}

function buildScale(id, name, theme, names, conv) {
  return {
    id,
    name,
    theme, // { accent, accent2 } — a light per-Scale visual shift
    resources: buildResources(names),
    ladder: buildLadder(conv),
    chainUnlocks: buildChainUnlocks(names, conv),
    unlockThresholds: UNLOCK_THRESHOLDS,
    sigma: { K_SIGMA, S_REF, upgrades: SIGMA_UPGRADES },
  };
}

// --- The Scale ladder (ordered; index 0 = Scale 1) --------------------------
export const SCALES = [
  buildScale(
    1, 'Quantum Foam', { accent: '#5b8cff', accent2: '#b06bff' },
    {
      energy: { n: 'Energy', s: 'E' },
      matter: { n: 'Matter', s: 'M' },
      components: { n: 'Components', s: 'Cp' },
      modules: { n: 'Modules', s: 'Md' },
      engines: { n: 'Engines', s: 'Eg' },
      structure: { n: 'Structure', s: 'S' },
    },
    {
      reactor: 'Reactor', extractor: 'Extractor', fabricator: 'Fabricator',
      assembler: 'Assembler', synthesizer: 'Synthesizer', integrator: 'Integrator',
    },
  ),
  buildScale(
    2, 'Atomic Lattice', { accent: '#4be0c0', accent2: '#ffb24b' },
    {
      energy: { n: 'Charge', s: 'Q' },
      matter: { n: 'Nucleons', s: 'N' },
      components: { n: 'Isotopes', s: 'Is' },
      modules: { n: 'Molecules', s: 'Ml' },
      engines: { n: 'Compounds', s: 'Cd' },
      structure: { n: 'Lattice', s: 'L' },
    },
    {
      reactor: 'Ionizer', extractor: 'Collector', fabricator: 'Fuser',
      assembler: 'Bonder', synthesizer: 'Compositor', integrator: 'Crystallizer',
    },
  ),
];

// Names of every Scale (incl. ones not yet defined) for the roadmap UI. Slots past
// the defined Scales read as locked "???" until added as data in a later phase.
export const SCALE_ROADMAP = [
  'Quantum Foam', 'Atomic Lattice', '???', '???', '???', '???', '???',
];

// --- Accessors the engine/UI use (all take `state`) -------------------------
export function scaleIndex(state) {
  return Math.max(0, Math.min(SCALES.length - 1, (state.currentScale || 1) - 1));
}
export function scaleOf(state) { return SCALES[scaleIndex(state)]; }
export function resourcesOf(state) { return scaleOf(state).resources; }
export function generatorsOf(state) { return scaleOf(state).ladder; }
export function upgradesOf(state) { return scaleOf(state).sigma.upgrades; }
export function chainUnlocksOf(state) { return scaleOf(state).chainUnlocks; }
export function resourceById(state, id) { return resourcesOf(state).find((r) => r.id === id); }
export function generatorById(state, id) { return generatorsOf(state).find((g) => g.id === id); }
export function hasNextScale(state) { return (state.currentScale || 1) < SCALES.length; }
