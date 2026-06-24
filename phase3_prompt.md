# Claude Code Prompt — AEON FORGE, Phase 3: Ascend, the Scale System, First Automator

## Context (read first)

This is **Phase 3** of AEON FORGE — the most structural phase since Phase 0. Phases 1–2 built a complete single-Scale game: the raw→refinement production chain (Reactors/Extractors → Fabricator → Components → Modules → Engines → Structure, with progressive `unlockedDepth`), input-throttled multi-link production, the itemizable multiplier system, Overclock, Resonance, Flux + abilities, the Collapse→Singularity prestige with a σ-shop, breakdown tooltips, and offline catch-up via a saturating cap.

Everything above currently assumes **one** Scale. Phase 3 generalizes that into a **data-driven Scale system** and adds the **Ascend** hard reset (the prestige-of-prestige), the **Aeon** meta-currency with a minimal **Aeon shop**, a second concrete Scale (**Atomic Lattice**), the **first Automator** (auto-buy), and an **offline-cap refinement**.

**This is the payoff of the data-driven mandate from Phase 0:** the engine, simulation, throttling, multiplier system, Collapse, Overclock, Resonance, and Flux must **not** be rewritten per Scale. Refactor the hardcoded Scale-1 content into a **per-Scale data definition**, and the only thing that differs between Scale 1 and Scale 2 is *data*. If you find yourself writing `if (scale === 2)` in engine logic, stop and move that difference into the Scale's data instead.

**Scope discipline:** no auto-Collapse yet (Phase 4); no Heat/Radiators or Paradigms (Phase 4); no Catalysts or energy-routing UI (Phase 5); the **full** branching Constants tree is Phase 6 (build only the small Aeon shop here); no parallel/background Scales (Phase 6); no Anomalies/antimatter (Phase 7); no Transcendent/Recursion/Paradoxes (Phase 8). Scale 2 is **re-themed and re-tuned but mechanically the same** as Scale 1 — its signature mechanic, like every later Scale's, arrives in a later phase.

## What to build

### 1. Data-driven Scale architecture (the refactor)

Extract all hardcoded Scale-1 content into a `scales[]` definition. Each Scale is **data**, roughly:

```
{
  id, name, theme,                       // e.g. 1, "Quantum Foam", visual/flavor tokens
  resources: [...],                      // themed resource ids + display names
  ladder: [ ...converter defs... ],      // the Reactor/Extractor + converter ladder, with
                                         //   baseCost, costGrowth, rates, consumes, tierResource
  sigma: { K_SIGMA, S_REF, upgrades },   // Collapse params + this Scale's σ-shop entries
  unlockThresholds: [...],               // lifetimeStructure thresholds for unlockedDepth
  ascendGate: {...},                     // condition to unlock Ascend (see below)
}
```

`state` now tracks `currentScale` plus the **within-Scale state** (resources, generator counts, `unlockedDepth`, σ, σ-upgrade levels, `structureThisCollapse`, `lifetimeStructure`, buffs). The engine reads `scales[currentScale]` for definitions; all Phase 1–2 systems operate on whatever the current Scale defines. Define **Scale 1 (Quantum Foam)** as the existing content reframed into this format, and **Scale 2 (Atomic Lattice)** as a second entry (below). Structure the array so Scales 3–7 can be added later as pure data.

> Note: "Structure" is the generic name for each Scale's **top/score/currency** resource. Re-theme its display name per Scale (Scale 2 below) but keep its role identical so all systems are Scale-agnostic.

### 2. Ascend (the hard reset) + Aeons

The prestige-of-prestige. Within a Scale the player Collapses repeatedly to bank σ; once the Scale is exhausted, they **Ascend** to the next Scale, converting Scale progress into **Aeons (Æ)**.

- **Track `sigmaThisScale`** — cumulative σ *earned* since entering the current Scale (only increases; not reduced by spending), used for the Æ payout so spending σ on upgrades doesn't reduce the reward.
- **Ascend gate:** unlocks when `unlockedDepth` has reached the chain's max (3) **and** `sigmaThisScale ≥ ASCEND_SIGMA_REQ` — i.e. the player has experienced the full Scale and built meaningful σ. Fire an "Ascension unlocked" moment the first time.
- **Æ gain:** `Æ = floor( AEON_A × currentScale^AEON_Q × log10(1 + sigmaThisScale) )`. The `currentScale^AEON_Q` term means deeper Scales pay more Æ; the `log10` keeps σ from exploding the payout. Show the live Æ-to-be-gained in the Ascend panel.
- **Performing an Ascend** (behind a confirm that makes the scale-jump feel momentous): grant the Æ, increment `currentScale`, and reset/keep per the table below. Make this a clear, satisfying transition (a brief scale-jump beat is welcome; full juice is Phase 8).

**Reset / keep on Ascend (be exact — this is the most bug-prone part):**

| Reset to fresh next-Scale defaults | Keep / gain |
|---|---|
| All resources → seed | **Aeons** (add the new Æ to the running total) |
| All generator counts → 0/seed | **Aeon-shop upgrade levels** (permanent, cross-Scale) |
| `unlockedDepth` → 0 (re-deepen) | **Automator** unlock + all Automator settings |
| **σ → 0 and all σ-upgrade levels → 0** (σ is Scale-bound) | `currentScale` (incremented) |
| `structureThisCollapse`, `lifetimeStructure` → 0 | **Flux** (persists; it's a session resource) |
| `sigmaThisScale` → 0 | Settings |
| All active buffs (Overclock, Surge, Overdrive) cleared; Resonance state cleared | — |

### 3. Aeon shop (minimal — precursor to the Phase 6 Constants tree)

Because Ascend wipes σ, Æ must be **immediately useful**. Build a small shop of **permanent, global, cross-Scale** upgrades bought with Æ (no branching or mutually-exclusive nodes yet — that's Phase 6). Suggested four:
- **Resonant Foundation** — ×1.5 all production per level (the core power upgrade; a `target:"all"` contribution applied in every Scale). Cost `1 × 3^level` Æ.
- **Singular Insight** — σ gain ×1.25 per level (faster σ → faster Collapses → faster Ascends, everywhere). Cost `2 × 3^level` Æ.
- **Temporal Reservoir** — +3600 s to the offline cap `T_CAP` per level. Cost `2 × 4^level` Æ.
- **Automation Matrix** — level 1 enables the Automator's "buy cheapest" mode and raises its per-tick buy cap; further levels improve auto-buy cadence. Cost `3 × 4^level` Æ.

These persist across all Ascends and Scales. Make clear in a one-liner that this shop expands into a deeper meta-tree later.

### 4. First Automator (auto-buy)

The first automation — it removes the **mastered busywork** (manually maintaining generator ratios) so the player focuses on the frontier (tier balance, Overclock/Flux timing, when to Collapse/Ascend). **Unlocked on the first Ascend.** It operates on **whatever Scale the player is currently in** (auto-buying that Scale's generators).

- An **Automator panel** with the first row(s) unlocked: a **master on/off**, a **per-generator auto-buy toggle** for each generator in the current Scale, a **reserve** setting (keep X% of Structure unspent so it doesn't starve the player's manual higher-tier purchases), and — once **Automation Matrix** ≥ 1 — a **"buy cheapest first"** mode. Build the panel so later phases can unlock additional rows (auto-Collapse in Phase 4, etc.).
- **Logic:** each tick (throttled to a few times/sec is fine), for each enabled generator, if affordable while respecting the reserve, buy it (reuse the existing buy + geometric-cost logic), up to a **per-tick buy cap** (e.g. 50) to avoid runaway. It must not fight the player or drain reserved Structure.
- **Offline:** the Automator does **not** auto-buy during offline catch-up (offline = production only, at the generator counts on departure); it resumes in the foreground. (A returning player thus finds accumulated resources, and the Automator ramps from there — predictable and satisfying. Offline automation is a possible later refinement.)

### 5. Offline-cap refinement

- Make `T_CAP` a **derived value**: `T_CAP_BASE` (7200 s) **plus** the Temporal Reservoir bonus. The offline calc stays `effective = T_CAP × (1 − exp(−elapsed / T_CAP))`, feeding the same `advance(effective)`.
- Improve the **offline modal** to clearly communicate **real time away vs effective time applied** and the current cap, so the saturating behavior is transparent (and so the value of Temporal Reservoir is visible).

### Save migration (the trickiest yet — restructure flat → Scale-nested)

Bump `SAVE_VERSION` to `4`; add migration `3 → 4` that **wraps the entire existing Phase-2 state as `currentScale = 1` (Quantum Foam)** with no loss — the player's resources, generator counts, `unlockedDepth`, σ, σ-upgrade levels, `structureThisCollapse`, `lifetimeStructure`, and Flux all map into Scale 1's within-Scale state. Initialize the new fields: `Æ = 0`, Aeon-shop levels `0`, `sigmaThisScale` seeded from current σ, Automator **locked** (the player hasn't Ascended yet) with default settings. Preserve user settings. Bump `CACHE_VERSION`.

## Balancing — starting values (centralize all in `constants.js`)

- **Æ formula:** `AEON_A = 1`, `AEON_Q = 1.5`. (First Ascend from Scale 1 with ~100 banked σ ≈ 2 Æ; a Scale-2 Ascend with ~300 σ ≈ 7 Æ — escalating, tunable.)
- **Ascend gate:** `ASCEND_SIGMA_REQ = 50`, plus `unlockedDepth == 3`.
- **Aeon shop:** effects and Æ costs as listed above.
- **Scale 2 (Atomic Lattice):** re-theme the six resources (suggested: Charge / Nucleons / Isotopes / Molecules / Compounds / **Lattice** as the top currency) and the converter names to fit; **reuse Scale 1's cost/rate/growth shape and `TIER_MULT`/`TIER_UNLOCK_MULT`** so it's balanced — the acceleration comes from carried Aeon upgrades + the Automator, not from re-tuning. (Per-Scale tuning can diverge in later phases.) Use the same σ formula params and unlock thresholds as Scale 1 unless a reason emerges.
- **Offline:** `T_CAP_BASE = 7200` s; Temporal Reservoir `+3600` s/level.
- **Automator:** per-tick buy cap `50`; default reserve `0%`; cadence a few ticks/sec.
- Keep all Phase 0–2 constants; bump `CACHE_VERSION`.

*Why this works:* Ascend converts a Scale's banked σ into permanent Æ power, so a hard reset is a strict long-term **gain** despite the local σ wipe — and the Aeon shop + Automator make the *next* Scale tangibly faster and qualitatively calmer (less clicking, more strategy), which is the prestige-layer "everything changed" moment. The Æ formula rewards both depth (`Scale^1.5`) and effort (`log σ`) without runaway. The Automator trails the frontier by design (granted only after conquering a Scale), keeping the newest content hands-on.

## UI (extend the existing layout; clean, dark, mobile-first)

- An **Ascend panel** (revealed when the gate is met): live Æ-to-be-gained, the gate condition, and a momentous confirm.
- The **Aeon shop**: the four upgrades with level, effect, Æ cost, Buy button; a current-**Æ** readout.
- The **Automator panel** (revealed after first Ascend): master toggle, per-generator toggles, reserve setting, and the "buy cheapest" mode (when unlocked).
- **Per-Scale re-theming:** resource/converter display names and a light visual/theme shift come from the current Scale's data, so entering Scale 2 visibly looks/reads different even though the mechanics match.
- **Recommended: a Scale roadmap/progression display** — a simple ladder showing the current Scale, the next named Scale, and further Scales as locked ("???" or named-but-locked) — for long-term-goal visibility and anticipation.
- Keep all prior UI (resource readouts, generator rows with efficiency %, buy toggle, Overclock, Collapse panel, σ-shop, Resonance, Flux meter + abilities, breakdown tooltips, settings/export/import/reset, offline modal).

## Definition of done — verify these

1. Loads with no console errors; a Phase-2 (v3) save migrates to v4 with the current run preserved as Scale 1 and no loss; settings preserved.
2. **Data-driven proof:** Scale 1 and Scale 2 are both defined purely as data; no engine/simulation/multiplier/Collapse/Overclock/Resonance/Flux code special-cases the Scale. (Adding a hypothetical Scale 3 would be a data edit.)
3. **Ascend gate:** appears only when `unlockedDepth == 3` and `sigmaThisScale ≥ ASCEND_SIGMA_REQ`; the live Æ preview matches the formula.
4. **Ascend executes correctly:** grants Æ, increments the Scale, and resets/keeps exactly per the table (σ and σ-upgrades wiped; Æ, Aeon-shop levels, Automator + settings, and Flux kept); buffs/Resonance cleared.
5. **Scale 2 plays:** the second Scale runs the full chain re-themed, deepens via its own thresholds, Collapses for σ, and is itself Ascendable — using the same systems.
6. **Aeon shop:** the four upgrades apply permanently and globally (verified persisting across an Ascend), with Resonant Foundation visibly multiplying production and Temporal Reservoir raising the offline cap.
7. **Automator:** unlocks on first Ascend; master + per-generator toggles + reserve + buy-cheapest work; auto-buys within the current Scale respecting the reserve and per-tick cap; does not auto-buy offline.
8. **Offline refinement:** the modal clearly shows real-vs-effective time and the current cap; Temporal Reservoir's effect on the cap is visible.
9. **Ascend feels like a gain, not a loss:** despite the σ wipe, the new Scale ramps tangibly faster and calmer thanks to Aeon upgrades + the Automator.
10. All prior systems still work, and the app still installs and runs **fully offline** on iPhone (regression).

## Deliverables

- The `scales[]` data structure with Scale 1 (Quantum Foam) and Scale 2 (Atomic Lattice) defined as data; the Ascend system; the Aeon shop; the first Automator; the offline-cap refinement; and the v3→v4 migration — all on top of the Phase 0–2 engine without per-Scale engine branching.
- All new tunables centralized in `constants.js`.
- Brief inline comments at the new boundaries — especially the Scale-config format, the Ascend reset/keep split, the Automator loop, and the derived `T_CAP` — so Phase 4 can add per-Scale mechanics (Heat) and another Automator row (auto-Collapse) cleanly, and Phase 6 can expand the Aeon shop into the branching Constants tree.
- Update `README.md` only if run/deploy/install steps changed (they shouldn't).

## Do NOT

- Do not rewrite the engine, simulation, multiplier system, Collapse, Overclock, Resonance, Flux, save/migration framework, PWA shell, or loop per Scale — generalize them and drive everything from Scale data.
- No auto-Collapse, Heat/Radiators, or Paradigms (Phase 4); no Catalysts or energy-routing UI (Phase 5); no full/branching Constants tree or parallel-running Scales (Phase 6); no Anomalies/antimatter (Phase 7); no Transcendent/Recursion/Paradoxes (Phase 8).
- Do not give Scale 2 a unique new mechanic — re-theme and re-tune only.
- No offline auto-buying.
- No heavy art or particles beyond a light scale-jump beat and the per-Scale theme shift — full polish is Phase 8.
