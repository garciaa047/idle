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
import {
  OVERCLOCK_MULT, TIER_UNLOCK_MULT, OVERDRIVE_MULT, SURGE_MULT, SINGULARITY_FOCUS_BONUS,
} from './constants.js';

// 'all' expands only over real production resources — never over sigmaGain. The
// Phase 2 intermediate stocks (components/modules/engines) are production too.
const PRODUCTION_TARGETS = new Set([
  'energy', 'matter', 'components', 'modules', 'engines', 'structure',
]);

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

  // Resonance Surge + Flux Overdrive — both temporary ×all, stored as wall-clock
  // end timestamps (checked inline to avoid an import cycle with flux/resonance).
  if ((state.surgeEndsAt || 0) > now) {
    out.push({ source: 'Resonance Surge', target: 'all', factor: SURGE_MULT });
  }
  if ((state.overdriveEndsAt || 0) > now) {
    out.push({ source: 'Flux Overdrive', target: 'all', factor: OVERDRIVE_MULT });
  }

  // Singularity Focus — arms a one-shot σ bonus that lands on the next Collapse.
  if (state.singularityFocusArmed) {
    out.push({ source: 'Singularity Focus', target: 'sigmaGain', factor: 1 + SINGULARITY_FOCUS_BONUS });
  }

  // Tier-unlock multiplier: each unlocked chain depth is a permanent ×all. Derived
  // straight from unlockedDepth so the milestone power-jump needs no stored field.
  if ((state.unlockedDepth || 0) > 0) {
    out.push({ source: 'Tier Unlocks', target: 'all', factor: Math.pow(TIER_UNLOCK_MULT, state.unlockedDepth) });
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
