// multipliers.js — the stackable multiplier system. FOUNDATIONAL: Flux/Resonance
// (Phase 2) and Constants/Paradigms/Catalysts (Phase 3+) all stack onto this.
//
// A multiplier is a contribution { source, target, factor }:
//   target — a production resource id ('energy'|'matter'|'structure'),
//            'all' (applies to every production resource), or
//            'sigmaGain' (the Collapse payout — production 'all' does NOT touch it).
// Effective multiplier for a target = product of all applicable factors.
//
// We also expose itemize() so a target's factors can be listed BY SOURCE. Phase 1
// only needs the aggregate, but Phase 2's production-breakdown tooltips need the
// itemization, so the capability is built in now.

import { UPGRADES } from '../content/upgrades.js';
import { overclockActive } from './overclock.js';
import { OVERCLOCK_MULT } from './constants.js';

// 'all' expands only over real production resources — never over sigmaGain.
const PRODUCTION_TARGETS = new Set(['energy', 'matter', 'structure']);

// Gather every active contribution from the current state. This is the single
// source of truth for "what is scaling production right now".
export function collectContributions(state, now = Date.now()) {
  const out = [];

  // σ-upgrades (persist across Collapses).
  for (const up of UPGRADES) {
    const level = (state.sigmaUpgrades && state.sigmaUpgrades[up.id]) || 0;
    if (level <= 0) continue;
    for (const c of up.contributions(level)) out.push({ source: up.name, ...c });
  }

  // Overclock surge (temporary, wall-clock bounded).
  if (overclockActive(state, now)) {
    out.push({ source: 'Overclock', target: 'all', factor: OVERCLOCK_MULT });
  }

  return out;
}

// Aggregate multiplier for one target = product of applicable factors.
export function multiplierFor(contributions, target) {
  const allowAll = PRODUCTION_TARGETS.has(target);
  let f = 1;
  for (const c of contributions) {
    if (c.target === target) f *= c.factor;
    else if (allowAll && c.target === 'all') f *= c.factor;
  }
  return f;
}

// Itemized factors applicable to a target, by source (for Phase 2 tooltips).
export function itemize(contributions, target) {
  const allowAll = PRODUCTION_TARGETS.has(target);
  return contributions
    .filter((c) => c.target === target || (allowAll && c.target === 'all'))
    .map((c) => ({ source: c.source, factor: c.factor }));
}
