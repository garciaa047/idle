# Claude Code Prompt — AEON FORGE, Phase 2: Refinement Chain, Resonance & Flux

## Context (read first)

This is **Phase 2** of AEON FORGE, building directly on Phase 1. Phase 1 delivered the Scale 1 loop: Reactors→Energy, Extractors→Matter, Fabricators consume Energy+Matter→Structure, plus the input-throttled production model, a stackable + itemizable multiplier system, the Overclock buff, and the Collapse→Singularity prestige with a four-upgrade σ-shop.

**Reuse and extend all of that — do not rebuild it.** This phase adds four things, all within the single Scale that currently exists (Phase 3 will add the Ascend/Scale system around it, at which point chain depth and tuning become per-Scale *data*; do not worry about that now):
1. A **multi-tier refinement chain** (Components → Modules → Engines → Structure) that **deepens progressively within the run**, so minute-one is unchanged.
2. **Resonance pickups** — periodic, tappable burst rewards (the "golden cookie" of this game).
3. **Flux** — an active-only currency that funds powerful, strategic, temporary boosts.
4. **Production-breakdown tooltips** and a **number-formatting upgrade**.

**Scope discipline:** still no Ascend / additional Scales / Automators (Phase 3); no Heat, Paradigms, Catalysts, energy-routing UI, parallel Forges, Constants, Anomalies, etc. (later). Everything here happens inside the one existing Scale.

## What to build

### 1. The refinement chain (progressive deepening, uniform rule)

Generalize Phase 1's single converter into a **converter ladder** with a uniform, data-driven rule. The ladder (bottom → top) and each converter's *tier resource*:

| index | converter   | consumes            | tier resource |
|-------|-------------|---------------------|---------------|
| 0     | Fabricator  | Energy + Matter     | Components    |
| 1     | Assembler   | Components          | Modules       |
| 2     | Synthesizer | Modules             | Engines       |
| 3     | Integrator  | Engines             | Structure     |

State holds `unlockedDepth` ∈ {0,1,2,3} = how many upper tiers are unlocked. A converter at index *i* is **active** iff `i ≤ unlockedDepth`.

**The uniform production rule:** among the active converters, the **highest-index active converter produces Structure** (the score/currency); every lower active converter produces its **tier resource**. So:
- `unlockedDepth = 0`: only the Fabricator is active → it produces **Structure** (exactly the Phase 1 loop; minute-one unchanged).
- `unlockedDepth = 1`: Fabricator → Components; **Assembler → Structure**.
- `unlockedDepth = 2`: Fabricator → Components; Assembler → Modules; **Synthesizer → Structure**.
- `unlockedDepth = 3`: Fabricator → Components; Assembler → Modules; Synthesizer → Engines; **Integrator → Structure**.

This single rule means deepening just increments `unlockedDepth`; no per-tier special-casing.

**Conversion math + amplification:** upper converters (Assembler, Synthesizer, Integrator) consume 1 unit/sec of the resource below and produce `TIER_MULT` (default 1.5) units/sec of their tier, per owned unit. The Fabricator stays Phase 1's raw boundary (1 Energy + 1 Matter → 1 unit). Effect: a deeper chain yields more Structure per unit of raw input (≈3.4× at full depth from `TIER_MULT` alone), and the natural per-line ratio expands mildly (1 : 1 : 1.5 : 2.25), which is the new balance puzzle.

**Intermediate resources** (Components, Modules, Engines) are real **stocks** that accumulate and are consumed by the tier above — so the Phase 1 throttling generalizes: **every** active converter throttles on *its* inputs. Each sub-step of `advance(dt)`, process in dependency order — producers (Reactor/Extractor) first, then converters bottom-to-top — so each tier sees the freshly produced intermediate below it. Each converter's efficiency = `min(1, available_input / demand)` over that sub-step (drawing from the relevant stock), produced/consumed proportionally. This must stay correct under offline catch-up (small sub-steps already guarantee this).

**Progressive unlocks:** track `lifetimeStructure` (cumulative Structure ever produced; introduce this counter). When it crosses each threshold, increment `unlockedDepth`, reveal the new tier (resource readout + converter row), fire a **"New tier unlocked"** notification with a one-line explanation, and grant a **permanent global production multiplier** (`×TIER_UNLOCK_MULT`, default 2, a `target:"all"` contribution in the existing multiplier system). With the suggested thresholds the first Collapse naturally happens before the first deepening, preserving the onboarding order.

### 2. Resonance pickups (active burst reward)

A drifting, tappable element that periodically appears and grants a weighted-random reward — optional, attention-rewarding, and a source of pleasant surprise.

- **Spawns only while the document is visible** (no offline/background spawns — this is the active-play reward). Spawn interval random in `[RESONANCE_MIN, RESONANCE_MAX]` seconds; it drifts across the screen and disappears after `RESONANCE_LIFETIME` seconds if not tapped.
- On tap, grant one weighted-random reward:
  - **Surge** (~45%): `×7` all production for 30s (a bigger, rarer Overclock — the "frenzy").
  - **Cache** (~35%): instant Structure equal to ~90 seconds of current production.
  - **Flux burst** (~20%): `+30` Flux.
- Give clear, lightweight feedback on what was caught. Functional visuals only — full polish is Phase 8, but the element does need to exist and be tappable on mobile (mind touch targets and safe areas).

### 3. Flux (active-only currency + strategic abilities)

A capped meter that **fills from active play and drains while idle**, spent on bounded, strategic boosts. This is the lever that gives active players an edge **without gating idle players** — idlers simply never engage with it and still reach everything.

- **Flux meter** 0 → `FLUX_CAP`. **Fills**: `+10` per Overclock tap, `+15` per Resonance caught, plus a small passive trickle (`+0.5/s`) **while visible**. **Drains** while the document is hidden (`−1/s`). Clamp to `[0, FLUX_CAP]`. (Tune so active play peaks around 1.5–3× effective output and never becomes mandatory.)
- **Flux abilities** (spend Flux; bounded effects; these are *strategic choices*, not passive multipliers):
  - **Overdrive** — cost 40 Flux → `×5` all production for 60s.
  - **Convergence** — cost 30 Flux → instantly fill every intermediate stock to ~60 seconds of demand, clearing throttling temporarily (the "unclog the factory" button).
  - **Singularity Focus** — cost 50 Flux → the next Collapse grants `+50%` σ (ties active play to meta-progression).
- All ability effects flow through the existing multiplier/state systems and respect wall-clock expiry like Overclock.

### 4. Breakdown tooltips + number formatting

- **Breakdown tooltips:** the Phase 1 multiplier system is itemizable — now expose it. Tapping a resource's per-second rate opens an expandable panel showing the **itemized breakdown**: base, then each multiplier source and its factor (σ upgrades, tier-unlock multipliers, Overclock, Resonance Surge, Flux Overdrive — whichever are active), and the current **efficiency %** for throttled tiers. Use **tap-to-expand** (no hover on touch).
- **Number formatting:** upgrade `format()` to gracefully cover the now-larger range: integers small, then a suffix ladder (K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc, …), then **scientific notation** (e.g. `1.23e36`) beyond a threshold (e.g. ~1e33), at a consistent precision (~3 significant figures). Apply everywhere numbers display, including rates and costs.

### Save migration

Schema changes again — exercise the migration framework: bump `SAVE_VERSION` to `3` and add a migration `2 → 3` that initializes the new fields (Components/Modules/Engines stocks, the three new converters, `unlockedDepth`, `lifetimeStructure`, Flux, Resonance state, Flux-ability timers). To avoid setting back a returning tester, **seed `unlockedDepth` from existing progress** (e.g. grant depth ≥ 1 if the player already owns σ, and derive higher depths from any available lifetime/Structure signal); otherwise start at 0. Preserve settings. Bump `CACHE_VERSION` so the update ships past the service worker.

## Balancing — starting values (centralize all in `constants.js`)

- **Chain:** `TIER_MULT = 1.5`; `TIER_UNLOCK_MULT = 2`.
- **Upper converter costs (in Structure):** Assembler base `200`, growth `1.15`; Synthesizer base `5e3`, growth `1.16`; Integrator base `1e5`, growth `1.17`. Each upper converter consumes `1/s` of the resource below and produces `TIER_MULT/s` of its tier, per unit.
- **Unlock thresholds (lifetimeStructure):** Components `5e3`, Modules `5e5`, Engines `5e7`.
- **Resonance:** `RESONANCE_MIN = 60`, `RESONANCE_MAX = 180` s, `RESONANCE_LIFETIME = 12` s; reward weights Surge `0.45` / Cache `0.35` / Flux `0.20`; Surge `×7` for `30` s; Cache `= 90` s of production; Flux burst `+30`.
- **Flux:** `FLUX_CAP = 100`; gains `+10`/Overclock, `+15`/Resonance, `+0.5/s` visible; drain `−1/s` hidden. Abilities: Overdrive (40 → `×5`, 60 s), Convergence (30 → fill stocks to ~60 s demand), Singularity Focus (50 → next Collapse `+50%` σ).
- Keep all Phase 0/1 constants; bump `CACHE_VERSION`.

*Why this works:* the chain deepens reward via `TIER_MULT` (throughput) **and** `TIER_UNLOCK_MULT` (a clear power jump per unlock = a milestone moment), while intermediate stocks keep every link a live balance decision; Resonance adds bounded randomness/surprise that rewards attention; Flux converts attention into *strategic* choices (when to Overdrive, when to unclog, when to bank σ) rather than mindless tapping; and the active stack (Overclock + Resonance + Flux) is tuned to ~1.5–3× peak so idle stays fully viable.

## UI (extend the existing layout; clean, dark, mobile-first)

- New **resource readouts** (Components, Modules, Engines) appear as their tiers unlock, each with amount and effective +/sec.
- New **converter rows** (Assembler, Synthesizer, Integrator) appear as they unlock, each with owned count, effective output, input consumption, next cost, Buy button, and an **efficiency %** (the throttle indicator now applies to every converter). Reuse the `×1 / ×10 / Max` buy toggle across all rows.
- Consider a compact **chain/flow view** that highlights the current bottleneck tier (optional but helpful; clear per-row efficiency % is the minimum).
- **Flux meter** + the three **Flux ability** buttons (greyed when unaffordable, with effect/cost labels).
- **Resonance** element spawning/drifting/tap handling + catch feedback.
- **Breakdown tooltips** (tap a rate to expand).
- **Tier-unlock notifications** with a one-line explanation each.
- Keep all prior UI (resource readouts, generator rows, Overclock, Collapse panel, σ-shop, settings/export/import/reset, offline modal).

## Definition of done — verify these

1. Loads with no console errors; a Phase 1 (v2) save migrates to v3 without crashing and without setting back a returning tester's depth; settings preserved.
2. **Minute-one unchanged:** a fresh Scale begins as the simple Fabricator→Structure loop (depth 0); the upper chain is not present yet.
3. **Progressive deepening:** crossing each `lifetimeStructure` threshold increments `unlockedDepth`, reveals the new resource + converter, fires a notification, grants the `×TIER_UNLOCK_MULT` global multiplier, and the top converter now pours Structure while lower tiers feed intermediates (uniform rule holds at every depth).
4. **Multi-link throttling:** every active converter throttles on its inputs; underbuilding any tier drops its efficiency % (shown) and balancing the full ladder is the puzzle; correct under offline catch-up.
5. **Resonance:** spawns only while visible, drifts, expires, and on tap grants a weighted-random Surge / Cache / Flux burst with clear feedback.
6. **Flux:** fills from Overclock taps, Resonance catches, and passive-while-visible; drains while hidden; capped; the three abilities spend Flux for their bounded strategic effects and respect wall-clock expiry.
7. **Breakdown tooltips:** tapping a resource's rate shows the itemized multiplier breakdown (each source + factor) and efficiency.
8. **Formatting:** large numbers render cleanly (suffix ladder then scientific, ~3 sig figs) everywhere.
9. **Bounded active edge:** skilled active play (Overclock + Resonance + Flux) peaks around ~1.5–3× vs pure idle; idle still reaches everything.
10. All prior systems still work (Collapse, σ-shop, Overclock, offline catch-up), and the app still installs and runs **fully offline** on iPhone (regression).

## Deliverables

- The refinement chain, Resonance, Flux + abilities, breakdown tooltips, and formatting upgrade, all on top of the Phase 0/1 structure.
- All new tunables centralized in `constants.js`.
- Brief inline comments at the new boundaries — especially the uniform converter rule + `unlockedDepth`, the multi-link throttling order, and the Flux fill/drain/visibility logic — so Phase 3 can cleanly wrap the Ascend/Scale system around this (chain depth becoming per-Scale data).
- Update `README.md` only if run/deploy/install steps changed (they shouldn't).

## Do NOT

- Do not rebuild the engine, multiplier system, save/migration framework, PWA shell, or loop — extend them.
- No Ascend, additional Scales, or Automators (Phase 3).
- No Heat/Radiators or Paradigms (Phase 4); no Catalysts or energy-routing UI (Phase 5); no parallel Forges / Constants / Aeons (Phase 6); no Anomalies / antimatter (Phase 7); no Transcendent / Recursion / Paradoxes (Phase 8).
- No production breakdown beyond the itemized multiplier panel; no caps on intermediate stocks (the throttle/balance is the teacher).
- No heavy art or particles beyond the functional Resonance/Flux visuals — full polish is Phase 8.
