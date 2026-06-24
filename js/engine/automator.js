// automator.js — the first Automator (auto-buy). It removes the MASTERED busywork
// of hand-maintaining generator ratios so the player focuses on the frontier
// (tier balance, Overclock/Flux timing, when to Collapse/Ascend). Unlocked on the
// first Ascend; it operates on WHATEVER Scale the player is currently in.
//
// It deliberately reuses applyPurchase() (the same geometric-cost spend as a manual
// buy) and never drains reserved Structure, so it can't fight the player. It is NOT
// run during offline catch-up (offline = production only) — see main.js.

import { AUTOMATOR_BUY_CAP } from './constants.js';
import { generatorsOf } from '../content/scales.js';
import { isActive, costFor, maxAffordable, applyPurchase } from '../content/generators.js';
import { aeonLevel } from '../content/aeon.js';

// Default Automator settings for a Scale (per-generator toggles built from its ladder).
export function defaultAutomator(scale, reservePct = 0) {
  const perGen = {};
  for (const g of scale.ladder) perGen[g.id] = false;
  return { unlocked: false, master: false, perGen, reservePct, buyCheapest: false };
}

// Run one automator pass. Returns total units bought (for optional feedback).
export function runAutomator(state) {
  const a = state.automator;
  if (!a || !a.unlocked || !a.master) return 0;

  const depth = state.unlockedDepth || 0;
  const matrix = aeonLevel(state, 'automationMatrix');
  // Automation Matrix (>=1) raises the per-tick cap and enables "buy cheapest".
  const cap = AUTOMATOR_BUY_CAP * (matrix >= 1 ? matrix + 1 : 1);

  // Reserve floor: keep reservePct% of CURRENT Structure unspent (computed once per
  // pass) so the Automator never starves the player's manual higher-tier buys.
  const reserve = (state.resources.structure || 0) * ((a.reservePct || 0) / 100);
  const spendable = () => Math.max(0, (state.resources.structure || 0) - reserve);

  // Eligible = enabled AND active in this Scale.
  const eligible = generatorsOf(state).filter((g) => a.perGen[g.id] && isActive(g, depth));
  if (eligible.length === 0) return 0;

  let bought = 0;

  // "Buy cheapest first" (requires Automation Matrix >= 1): repeatedly buy the
  // single cheapest next unit across eligible gens, keeping ratios balanced.
  if (a.buyCheapest && matrix >= 1) {
    while (bought < cap) {
      let best = null;
      let bestCost = Infinity;
      for (const g of eligible) {
        const c = costFor(g, state.generators[g.id] || 0);
        if (c < bestCost) { bestCost = c; best = g; }
      }
      if (!best || bestCost > spendable()) break;
      bought += applyPurchase(state, best, 1);
    }
    return bought;
  }

  // Default mode: buy as many of each eligible gen as the reserve-respecting budget
  // and the remaining cap allow.
  for (const g of eligible) {
    if (bought >= cap) break;
    const owned = state.generators[g.id] || 0;
    const affordable = maxAffordable(g, owned, spendable());
    const count = Math.min(affordable, cap - bought);
    if (count > 0) bought += applyPurchase(state, g, count);
  }
  return bought;
}
