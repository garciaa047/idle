# Claude Code Prompt — AEON FORGE, Phase 1: Scale 1 Core Loop, Overclock & Collapse

## Context (read first)

This is **Phase 1** of AEON FORGE, building directly on the Phase 0 scaffold. Phase 0 delivered the engine (a single serializable `state`, a data-driven `content` layer, a composable `advance(seconds)` simulation that chunks into sub-steps, autosave + export/import + a versioned migration framework, offline progress with a saturating cap, number formatting, and the offline-first PWA shell).

**Reuse all of that.** Do not rebuild the engine, the save system, the PWA shell, or the loop — *extend* them. This phase replaces the Phase 0 placeholder content (the base Energy trickle and the "Collector") with the real **Scale 1 ("Quantum Foam")** economy and adds three foundational systems that later phases lean on heavily: **input-throttled production**, a **stackable multiplier system**, the **Overclock** active mechanic, and the **Collapse** prestige (Singularity).

Goal: the core loop should be **genuinely fun within 5 minutes**, and repeated Collapses should visibly accelerate each new cycle.

**Scope discipline:** Scale 1 is the *simplified* chain — raw resources convert straight to Structure. Do **not** add the Components/Modules/Engines compound chain (Phase 2), Resonance pickups or Flux (Phase 2), Ascend / additional Scales / Automators (Phase 3), or anything later. Build only what's specified here.

## What to build

### The Scale 1 economy (three resources, three generators)

Three resources, all stock-based (they accumulate and are visible):
- **Energy** — produced by Reactors, consumed by Fabricators.
- **Matter** — produced by Extractors, consumed by Fabricators.
- **Structure** — produced by Fabricators; the run score and the **currency all generators are bought with**.

Three generators (defined as data in the content layer, extending Phase 0's generator model):
- **Reactor** — produces Energy.
- **Extractor** — produces Matter.
- **Fabricator** — **consumes** Energy + Matter and **produces** Structure.

**Bootstrap:** the player starts a fresh Scale with a small **seed of Structure** (see constants) — enough to buy the first Reactor, Extractor, and Fabricator and get Structure climbing. Remove the Phase 0 placeholder base Energy trickle; Reactors are now the Energy source.

### New system 1 — input-throttled production (the throughput puzzle)

Generators now need a richer data shape than Phase 0. Each generator definition should express what it **produces** and (optionally) what it **consumes**, per owned unit per second. Extend `stepSimulation(dt)` so that, each sub-step:
1. Producers (Reactor, Extractor) add their output to the resource stocks.
2. Consumers (Fabricator) compute total demand for each input (Energy, Matter). The fraction of demand that can actually be met = `min(1, availableEnergy / energyDemand, availableMatter / matterDemand)` for this sub-step (drawing from current stock; treat a producer's same-step output as available). Fabricators then produce Structure at that **efficiency fraction** and consume inputs proportionally.

Effect: too many Fabricators relative to Reactors/Extractors **starves** them — they run below 100% — and adding more Reactors/Extractors relieves it. Accumulated surplus Energy/Matter acts as a natural buffer (e.g. absorbing Overclock spikes) before throttling kicks in. With the suggested numbers the natural ratio is **1 Reactor : 1 Extractor : 2 Fabricators**, which players should be able to discover by watching the efficiency indicator. This throttling must compute **per sub-step** so it stays correct under the composable `advance()` (including offline catch-up).

Surface the current Fabricator **efficiency %** in the UI (e.g. "running at 67% — Energy starved") so the balance lesson is legible.

### New system 2 — stackable multiplier system (foundational)

Build a clean, extensible multiplier system, because Flux/Resonance (Phase 2), Constants/Paradigms/Catalysts (Phase 3+) all stack onto it.

- Model multipliers as a collection of contributions, each roughly `{ source, target, factor }`, where `target` is what it scales (e.g. `"structure"`, `"energy"`, `"matter"`, or `"all"`).
- Effective production for a target = base × **product of all applicable factors** (a `target: "all"` contribution applies to everything; a specific target stacks on top).
- Expose a function that returns the aggregate multiplier for a target **and** can itemize the contributions by source — Phase 2 will use the itemization for production-breakdown tooltips, so build that capability in now even though this phase only needs the aggregate.
- Phase 1 multiplier sources: the σ-upgrades and the Overclock buff (below).
- Displayed per-second rates and the Collapse preview must reflect current multipliers (and, for Structure, current efficiency).

### New system 3 — Overclock (active mechanic)

A tap that surges all production, then goes on cooldown:
- Tapping **Overclock** applies a temporary `×OVERCLOCK_MULT` multiplier to all production (a `target: "all"` contribution) for `OVERCLOCK_DURATION` seconds, then a `OVERCLOCK_COOLDOWN`-second cooldown.
- Store this as wall-clock timestamps in `state` (`overclockEndsAt`, `overclockCooldownEndsAt`) so it behaves correctly across backgrounding — i.e. on resume, a buff whose window has passed is simply expired. (Do not advance buff time as "offline production time"; it expires in real time.)
- UI: a button showing one of three states — Ready / Active (with seconds remaining) / Cooling Down (with seconds remaining).
- One tap = one surge window (not a click-spam mechanic). With the suggested numbers an attentive player who re-triggers each cooldown gains roughly **1.5× effective output** — the intended bounded edge for active play. Idle players who never tap still progress fine.

### New system 4 — Collapse (prestige) + the Singularity shop

The within-Scale soft reset.

- Track `structureThisCollapse`: a **cumulative** counter of all Structure *produced* since the last Collapse (it only ever increases — it is **not** current Structure, so spending Structure on generators must not reduce it). Offline-produced Structure counts toward it too.
- **Singularity (σ) gain on Collapse:** `σ = floor( K_SIGMA × (structureThisCollapse / S_REF) ^ 0.5 )`. The square root makes it sublinear — doubling output does **not** double σ — so each Collapse gives diminishing-but-positive returns and *when* to Collapse becomes a real optimal-stopping decision.
- **Minimum gate:** the Collapse button is disabled until `structureThisCollapse ≥ S_REF` (i.e. until it would grant at least 1 σ). Show the live σ-to-be-gained in the Collapse panel.
- **Performing a Collapse:** behind a short confirm, grant the σ, then reset **run-level state only** — Energy, Matter, Structure, all generator counts, `structureThisCollapse`, and active buffs — back to the fresh-Scale seed. **Persist** σ and all σ-upgrade levels (and settings). This is the key prestige distinction: σ and what it buys carry over; everything below resets.

**σ-upgrades** (spend σ; persist across Collapses; all feed the multiplier system). Suggested set of four, enough for a real spend decision (focus vs broaden vs snowball):
- **Fabrication Yield** — ×1.20 Structure production per level. Cost: `1 × 2^level` σ.
- **Throughput** — ×1.20 Energy *and* Matter production per level. Cost: `1 × 2^level` σ.
- **Resonance** — ×1.10 to *all* production per level (the global compounder). Cost: `2 × 3^level` σ.
- **Collapse Yield** — +10% σ gained on Collapse per level (the snowball; watch this one in balancing). Cost: `3 × 4^level` σ.

Reveal the σ-shop once the player has earned σ (or Collapsed once) with a brief surfacing.

### Save migration (first real use of the framework)

This phase changes the save schema, so exercise the Phase 0 migration system: bump `SAVE_VERSION` to `2` and add a migration `1 → 2` that initializes the new fields (Matter, Structure, the three generators, σ, σ-upgrade levels, overclock timers, `structureThisCollapse`) and removes the placeholder Collector. Preserve user settings. A Phase 0 save must load without crashing.

## Balancing — starting values (centralize all in `constants.js`)

These are tuned for a snappy opening and a satisfying first Collapse within a few minutes; they are starting points to retune.

- `SEED_STRUCTURE = 35`
- **Reactor:** baseCost `10` Structure, costGrowth `1.13`, output `+2 Energy/sec` per unit.
- **Extractor:** baseCost `10` Structure, costGrowth `1.13`, output `+2 Matter/sec` per unit.
- **Fabricator:** baseCost `10` Structure, costGrowth `1.15`; consumes `1 Energy/sec + 1 Matter/sec`, produces `1 Structure/sec` per unit at full efficiency.
- **Collapse:** `K_SIGMA = 1`, `S_REF = 100` (so `structureThisCollapse ≈ 1,000` → ~3 σ; `≈ 10,000` → 10 σ; `≈ 1e6` → 100 σ). Minimum gate = `S_REF`.
- **Overclock:** `OVERCLOCK_MULT = 3`, `OVERCLOCK_DURATION = 15` s, `OVERCLOCK_COOLDOWN = 60` s.
- σ-upgrade effects and costs as listed above.
- Keep Phase 0's `T_CAP` (offline cap, 7200 s), `AUTOSAVE_INTERVAL`, `MAX_STEP`, and `CACHE_VERSION` (bump `CACHE_VERSION` so the update ships past the service worker).

*Why these work:* geometric costs (×1.13–1.15) against roughly geometric income create the buy-cheapest loop and a natural stall point that motivates Collapse; the Reactor/Fabricator ratio (2 produced : 1 consumed) yields the clean 1:1:2 balance to discover; the √ on σ keeps prestige from running away and makes stopping a decision; Overclock's 15s/60s window lands active play at ~1.5×.

## UI (extend the Phase 0 layout; keep it clean, dark, mobile-first)

- **Three resource readouts** — Energy, Matter, Structure — each with current amount and effective +/sec (reflecting multipliers and, for Structure, efficiency).
- **Generator rows** — Reactor, Extractor, Fabricator — each with owned count, effective output, next cost (formatted, in Structure), and a Buy button (greyed when unaffordable). For the Fabricator, show current input consumption and the **efficiency %**.
- **Buy-amount toggle** — a `×1 / ×10 / Max` control affecting all Buy buttons (a big QoL win as costs climb; keep the logic simple — buy up to the chosen count or as many as affordable).
- **Overclock button** — Ready / Active(Xs) / Cooldown(Xs).
- **Collapse panel** — live σ-to-be-gained, the minimum gate, and a confirm.
- **Singularity shop** — each σ-upgrade with level, effect, σ cost, Buy button; revealed after first σ.
- Keep the Phase 0 **settings panel** (export / import / hard reset) and the **offline-gains modal**, now reporting Energy, Matter, and Structure (and noting that offline Structure counts toward the next Collapse).

A small, satisfying visual beat on Collapse and on Overclock is welcome, but keep it lightweight — real juice and polish are Phase 8.

## Definition of done — verify these

1. Loads with no console errors; a Phase 0 (v1) save migrates to v2 without crashing, settings preserved, placeholder content gone.
2. Bootstrap: seed Structure buys the first Reactor/Extractor/Fabricator and Structure begins climbing; the player is never hard-stuck.
3. Production chain: Energy and Matter accumulate from Reactors/Extractors; Fabricators consume them to produce Structure. Adding Fabricators beyond input capacity drops efficiency below 100% (shown in UI); adding Reactors/Extractors restores it. The 1:1:2 balance is discoverable. Throttling is correct under offline catch-up.
4. Geometric costs apply per purchase; the `×1 / ×10 / Max` toggle works.
5. Multiplier system: each σ-upgrade raises the relevant production multiplicatively and visibly; effective rates update live; the aggregate is itemizable by source (for later tooltips).
6. Overclock: surges all production by `×OVERCLOCK_MULT` for the duration, then cools down; the three-state button and timers are correct, and the buff expires by wall clock after backgrounding.
7. Collapse: live σ preview via the √ formula; gated by the minimum; confirming resets run-level state (resources, generator counts, buffs, `structureThisCollapse`) while persisting σ and σ-upgrades.
8. `structureThisCollapse` is cumulative-produced (not current) — spending Structure on generators does not reduce the σ you'll gain.
9. Offline: all three resources accrue via the same `advance()` + saturating cap; the modal reports them; offline Structure counts toward the next Collapse.
10. The loop rewards: repeated Collapses, via compounding σ-upgrades, visibly speed up each new cycle — and the whole thing is engaging within ~5 minutes.

On-device regression: still installs to the iPhone Home Screen and runs fully offline (airplane mode) after the update.

## Deliverables

- The Scale 1 economy, the four new systems, the σ-shop, and the migration, all working on top of the Phase 0 structure.
- All new tunables added to `constants.js` (centralized).
- Brief inline comments at the new system boundaries — especially the per-sub-step throttling, the multiplier aggregation/itemization, and the Collapse reset/persist split — so Phase 2 can extend the chain and add Flux/Resonance cleanly.
- Update `README.md` only if the run/deploy/install steps changed (they shouldn't).

## Do NOT

- Do not rebuild the engine, save system, migration framework, PWA shell, or game loop — extend them.
- No Components / Modules / Engines compound chain (Phase 2).
- No Resonance pickups, no Flux (Phase 2).
- No production-breakdown tooltip UI yet — but make the multiplier data itemizable so Phase 2 can add it.
- No Ascend, additional Scales, or Automators (Phase 3); no Heat, Paradigms, Catalysts, parallel Forges, or Anomalies (later).
- No heavy art, particles, or visual juice beyond small functional beats — that is Phase 8.
