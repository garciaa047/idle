# Claude Code Prompt — AEON FORGE, Phase 4: Heat & Radiators, Paradigms, Auto-Collapse

## Context (read first)

This is **Phase 4** of AEON FORGE, building on Phase 3. Phase 3 delivered the data-driven Scale system (Scales are data; the engine doesn't special-case them), the Ascend hard reset with Aeons + a minimal Aeon shop, the second Scale (Atomic Lattice), the first Automator (auto-buy within the current Scale), and the refined offline cap.

Phase 4 adds the game's first **per-Scale signature mechanic** and its **build-defining specialization layer**, plus the next automation row:
1. A **mechanic-module system** — a Scale's data declares which optional mechanics it runs; the engine activates modules by flag. **Heat** is the first module.
2. **Heat / Entropy + Radiators**, on a new third Scale, **Planetary Crust**.
3. The **Paradigm system** — four mutually-exclusive specializations that fundamentally change how you build.
4. The **auto-Collapse** Automator row.

**Key architectural point:** Phase 3 made Scales differ by data; Phase 4 must make *mechanics* modular too. Do **not** write `if (scale === 3)` to add Heat. Add a mechanic-module mechanism where the current Scale's data lists active mechanics (e.g. `mechanics: ["heat"]`) and the engine wires in the matching simulation hook + UI panel only when present. This is the reusable pattern for **every** future Scale mechanic — get it clean here.

**Scope discipline:** no Catalysts or energy-routing UI (Phase 5); no parallel Forges or the full branching Constants tree (Phase 6); no Anomalies/antimatter (Phase 7); no Transcendent/Recursion/Paradoxes (Phase 8). Build only Scale 3 (not Scales 4–7). Heat belongs to Scale 3 via the module flag — do not force it onto Scales 1–2.

## What to build

### 1. Mechanic-module system (the architectural pattern)

Extend the Scale-config format with a `mechanics: [...]` list. A mechanic module bundles: optional **simulation hooks** (run inside `stepSimulation(dt)` when active), optional **multiplier contributions** (registered into the existing itemizable multiplier system so they show in breakdown tooltips), optional **state fields** (initialized when a Scale with that mechanic is entered), and an optional **UI panel** (rendered only when active). The engine checks the current Scale's `mechanics` and activates the corresponding modules — nothing Scale-number-specific. Heat is implemented as the first such module.

### 2. Heat / Entropy + Radiators (Scale 3: Planetary Crust)

Add **Scale 3 (Planetary Crust)** as data (re-themed resources/converters per the Scale system), with `mechanics: ["heat"]`. Implement the Heat module:

**Heat generation (scale-invariant, ratio-based — important):** Heat must work at any production magnitude, so tie it to generator **counts**, not output magnitude. Per second:
`heatGen = (sum of converter counts) × HEAT_PER_CONVERTER × buffMult × heatSoftCap`
where `buffMult` is the current active-buff multiplier (Overclock/Surge/Overdrive ≥ 1) and `heatSoftCap` is the throttle factor below. (Reactors/Extractors/Radiators don't generate Heat — fabrication is what runs hot.) Including `heatSoftCap` in `heatGen` makes Heat **self-limiting** — as Heat rises, generation falls — so there's **no death spiral**, just an equilibrium efficiency.

**Heat dissipation:** `heatDissipation = (Radiator count) × HEAT_DISSIPATION_PER_RADIATOR + AMBIENT_COOL_RATE × Heat`. Radiators are a **new generator type** in Scale 3 (bought with the Scale's currency); ambient cooling is a small proportional term so Heat always reaches a finite equilibrium even with no Radiators. Net: `dHeat/dt = heatGen − heatDissipation`, Heat floored at 0. Compute per sub-step so it stays correct under offline catch-up (Heat reaches its steady state offline too).

**The throttle (soft-cap):** `heatSoftCap = 1 / (1 + (Heat / H_THRESH)^2)` — a `target:"all"` contribution in the multiplier system, so it both reduces output and shows in breakdown tooltips (e.g. "Heat ×0.62"). At Heat = `H_THRESH`, production halves.

**The build puzzle + active/idle dynamic:** because gen scales with converter count and dissipation with Radiator count, the player maintains a **Radiator : converter ratio** (a thermal cousin of the chain-balance ratio) to keep Heat low. Active surges (Overclock/Surge/Overdrive) multiply `buffMult`, spiking Heat over several seconds — so naive surging overheats and partly eats its own boost, while a player who's invested in extra Radiator headroom can *sustain* surges. Idlers never surge, so they run at a steady, cooler, lower-output equilibrium. This is the intended thermal-management skill layer and bounded active edge. Surface a **Heat gauge** with current Heat, gen/sec, dissipation/sec, the resulting multiplier, and `H_THRESH`, so it's legible and managed.

### 3. Paradigm system (the build-diversity centerpiece)

Four **mutually-exclusive** specializations that change how you build. **Unlocked on first reaching Scale 3**; the player chooses one, and from then on it's a persistent meta-layer carried across all subsequent Scales. **Freely re-selectable** (the brief wants safe experimentation) — but design each paradigm's benefit to depend on the *built state*, so swapping mid-build naturally sacrifices accrued advantage rather than needing a hard lock. (Expose an optional swap cooldown constant in case playtesting shows thrash-cheese.)

- **Expansion (wide):** generator cost growth reduced (effective growth ×`EXP_GROWTH_MULT`, ~0.97) so you afford far more units, plus a production bonus that scales with **total generators owned** (e.g. +`EXP_BONUS_PER`% per generator, with diminishing returns). Synergizes with auto-buy. Win by quantity.
- **Density (tall):** all multiplicative upgrades (σ-upgrades, tier-unlock multipliers, Aeon multipliers) are ×`DENSITY_MULT_BOOST` (~1.5) stronger, but generator cost growth is ×`DENSITY_GROWTH_MULT` (~1.05) steeper so you buy fewer units. Win by stacking upgrades.
- **Entropy (hot/aggressive, Heat-favoring):** replaces the Heat throttle with a **bonus** — production gains `×(1 + ENTROPY_HEAT_BONUS × tanh(Heat / H_THRESH))` (hotter = stronger, saturating so it's bounded), Radiators become largely unnecessary; in exchange, σ gain is ×`ENTROPY_SIGMA_PENALTY` (~0.7), trading faster raw output for slower prestige. This is the obvious pick for Heat Scales — fulfilling the "couple paradigms to content type" design rule — and is idle-tolerant.
- **Computation (hands-off optimizer):** a fraction of Structure production also accrues as **Insight** (`COMP_INSIGHT_RATE`, ~10%); Insight **auto-buys the cheapest affordable σ-upgrade** and unlocks the Automator's auto-upgrade behavior; in exchange, a −`COMP_PROD_PENALTY` (~20%) global production multiplier. Trades peak output for automated optimization. (Insight is Scale-bound — reset on Ascend like σ.)

These create real, divergent play patterns (auto-buy-wide vs upgrade-tall vs run-hot vs automate-and-optimize), each favoring different content, so no single paradigm dominates — exactly the build diversity and anti-solve the design calls for. All effects flow through the existing multiplier/state systems and appear in breakdown tooltips where relevant.

### 4. Auto-Collapse (next Automator row)

Add a row to the Automator panel, **unlocked on reaching Scale 3** ("automation trails the frontier by one Scale"): a toggle plus a **threshold** — auto-Collapse when the pending σ gain is ≥ a value the player sets (clear and understandable). Combined with auto-buy, this lets a conquered Scale's σ-grind run hands-off, while the frontier (Heat management, Paradigm choice, when to Ascend) stays hands-on. Reuse the existing Collapse logic; respect the minimum gate. (Still no auto-Ascend — that's a much later unlock.)

### Save migration

Bump `SAVE_VERSION` to `5`; migration `4 → 5` initializes new fields: Heat state (relevant only in Heat Scales), current Paradigm = unset (chosen on reaching Scale 3), Insight = 0, auto-Collapse settings (off, default threshold), and adds Scale 3 (with its `mechanics` flag and Radiator generator) to `scales[]`. Existing players keep their Scale/progress. Preserve settings. Bump `CACHE_VERSION`.

## Balancing — starting values (centralize all in `constants.js`)

- **Heat:** `H_THRESH = 100`; `HEAT_PER_CONVERTER = 2` (Heat/s per converter unit); `HEAT_DISSIPATION_PER_RADIATOR = 10`; `AMBIENT_COOL_RATE = 0.02` (proportional). → no-surge balance ≈ 1 Radiator per 5 converters for ~zero throttle; a ×3 surge needs ~3× Radiator headroom to fully sustain, else a temporary spike. **Tune the Heat timescale** so surges visibly heat up over several seconds rather than instantly.
- **Radiator (Scale 3):** baseCost comparable to that Scale's converters, growth ~`1.14`, dissipation `10`/unit.
- **Paradigms:** Expansion `EXP_GROWTH_MULT = 0.97`, `EXP_BONUS_PER = 0.5%` (diminishing); Density `DENSITY_MULT_BOOST = 1.5`, `DENSITY_GROWTH_MULT = 1.05`; Entropy `ENTROPY_HEAT_BONUS = 0.5`, `ENTROPY_SIGMA_PENALTY = 0.7`; Computation `COMP_INSIGHT_RATE = 0.10`, `COMP_PROD_PENALTY = 0.20`. Optional `PARADIGM_SWAP_COOLDOWN` (default 0 = free).
- Keep all Phase 0–3 constants; bump `CACHE_VERSION`.

*Why this works:* Heat as a count-ratio mechanic is scale-invariant (meaningful at any magnitude) and self-limiting (no death spiral), and its interaction with surges turns active play into thermal *management* rather than mindless tapping. The four paradigms are genuinely divergent play patterns tied to different content — Entropy shines in Heat Scales, Computation in idle/automation, Expansion with heavy auto-buy, Density with upgrade stacking — so the dominant-strategy risk is defused by content coupling, and free swapping (tempered by build-dependence) keeps experimentation safe per the design.

## UI (extend the existing layout; clean, dark, mobile-first)

- **Heat gauge** (only in Heat Scales): current Heat vs `H_THRESH`, gen/sec, dissipation/sec, and the resulting production multiplier; visibly spikes during surges. Plus the **Radiator** generator row (efficiency/throttle context as appropriate).
- **Paradigm selector** (revealed on reaching Scale 3): the four paradigms with a one-line description of each one's playstyle and tradeoff, the current selection highlighted, and re-select support (with the cooldown if enabled). When Computation is active, show an **Insight** readout.
- **Auto-Collapse** row in the Automator panel: toggle + σ-threshold input.
- Breakdown tooltips now also itemize the **Heat** multiplier and any active **Paradigm** modifiers.
- Keep all prior UI (resources, generator rows + efficiency %, buy toggle, Overclock, Collapse panel, σ-shop, Resonance, Flux + abilities, Ascend panel, Aeon shop, Automator, Scale roadmap, settings, offline modal).

## Definition of done — verify these

1. Loads with no console errors; a Phase-3 (v4) save migrates to v5 cleanly; settings and progress preserved.
2. **Module pattern proven:** Heat is wired in purely via Scale 3's `mechanics` flag — no Scale-number special-casing in engine logic — and Scales 1–2 are unaffected (no Heat).
3. **Heat behaves:** Heat accumulates from converter activity and dissipates via Radiators + ambient; the soft-cap throttles production and shows in tooltips; building Radiators raises efficiency; the system is stable (no death spiral) and reaches a finite equilibrium even with zero Radiators; Heat reaches steady state offline.
4. **Active/idle thermal dynamic:** surging spikes Heat over several seconds and partly throttles itself unless extra Radiator headroom exists; idle runs cooler/lower — a real management decision, bounded edge intact.
5. **Paradigms diverge:** each of the four produces a distinctly different optimal build; Entropy clearly favors the Heat Scale; effects appear in tooltips; re-selecting works and (by build-dependence) swapping mid-build forfeits accrued advantage.
6. **Computation:** Insight accrues and auto-buys σ-upgrades; the production penalty applies; Insight resets on Ascend.
7. **Auto-Collapse:** unlocks on Scale 3; the σ-threshold toggle Collapses hands-off, respecting the minimum gate; combined with auto-buy, a conquered Scale runs idle while the frontier stays hands-on.
8. **No regressions:** Collapse, Ascend (reset/keep table), Overclock, Resonance, Flux, Aeon shop, the Automator's auto-buy, and offline catch-up all still work; the app still installs and runs **fully offline** on iPhone.

## Deliverables

- The mechanic-module system; the Heat module + Radiators on Scale 3 (Planetary Crust) as data; the four-paradigm system; the auto-Collapse Automator row; and the v4→v5 migration — all on the Phase 0–3 engine with no Scale-number special-casing.
- All new tunables centralized in `constants.js`.
- Brief inline comments at the new boundaries — especially the mechanic-module interface (how a module registers sim hooks, multiplier contributions, state, and UI), the Heat feedback/equilibrium logic, and the Paradigm modifier hooks — so Phase 5 can add the Catalyst module and routing, and later phases can add the antimatter and recursion modules, the same way.
- Update `README.md` only if run/deploy/install steps changed (they shouldn't).

## Do NOT

- Do not special-case Scales in engine logic — add per-Scale mechanics as data-toggled modules.
- No Catalysts or energy-routing UI (Phase 5); no parallel Forges or full/branching Constants tree (Phase 6); no Anomalies/antimatter (Phase 7); no Transcendent/Recursion/Paradoxes (Phase 8); no auto-Ascend yet.
- Do not build Scales 4–7 — only Scale 3. Do not apply Heat to Scales 1–2.
- No heavy art or particles beyond the functional Heat gauge and a light surge/heat visual — full polish is Phase 8.
