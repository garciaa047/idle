# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repo currently contains **only the design document** (`aeon_forge_design.md`). No code, build tooling, or scaffold exists yet. AEON FORGE is an incremental/idle game that fuses factory automation with cosmic-scale prestige ascension, shipped as an **offline-first PWA**. When implementing, read `aeon_forge_design.md` in full — it is the spec, and the section references below point into it.

## Intended tech stack & build

Per the Phase 0 plan (design §10): **static HTML/CSS/JS PWA** — no framework, no bundler implied. Service worker for full offline support, web app manifest for install, `localStorage` for save/export/import. The target deploy surface is an iPhone Home Screen install; each build phase must be independently runnable and testable there before moving on.

No package manager, test runner, or lint config is established yet. When introducing one, prefer the lightest option that preserves the static-asset, zero-build, offline-first constraint, and record the resulting commands here.

## Architectural spine (do not deviate without reason)

The entire game is built on three pillars (design §10). Every phase adds **data**, not new control flow:

1. **A single data-driven game-state object** — the complete save/runtime state.
2. **A delta-time `tick(dt)` function** — advances all production, heat, currencies, automation. Must be frame-rate independent and reusable for offline catch-up.
3. **A `render()` pass** — reads state, draws UI. Keep separate from `tick`.

**All content is data, not code:** producers, scales, upgrades, constants, paradigms, anomalies, catalysts, and paradoxes are defined as data entries consumed by generic logic. Adding a new producer tier or Scale should mean adding a data record, never branching the engine. If you find yourself writing per-producer or per-Scale `if` chains, that is a smell — generalize into the data model instead.

## Core loop & prestige layers (the mental model)

Four nested loops at increasing cadence (design §2). The production chain within a run:

```
Reactors → Energy ┐
                  ├→ Fabricators → Components → Modules → Engines → Structure
Extractors → Matter ┘
```

Three nested resets of increasing consequence (design §5) — keep these strictly separate in state and logic:
- **Collapse** (frequent, within a Scale): resets the production chain, mints **Singularity (σ)**.
- **Ascend** (occasional): full reset, advances to the next **Scale**, mints **Aeons (Æ)**, grants an Automator.
- **Recursion** (endgame): resets Æ + Constants, grants Eternal Constants.

Each Scale (design §4) resets units to small numbers, introduces exactly **one new mechanic** and **one automation grant**. The 7 Scales are an ordered data-defined ladder (Quantum Foam → … → Transcendent).

## Design invariants that constrain the math

These are deliberate balance decisions (design §7–8). Don't "fix" them — they exist to prevent known incremental-game failure modes:

- **Geometric producer cost** `cost(n) = base · r^n`, `r ≈ 1.12`–`1.18`. The differing `r` is what makes the Expansion vs Density paradigms mathematically distinct.
- **Sublinear prestige gains** — `σ ∝ S_total^0.5`, `Æ ∝ Scale^q · log10(1+Σσ)`. The sublinearity is intentional (optimal-stopping decision; no single mega-run solves the game).
- **Saturating offline curve** `t_eff = T_cap · (1 − e^(−t/T_cap))` — front-loads gains so checking in matters without making 24h-away strictly optimal. Offline catch-up should reuse the same `tick` logic, not a parallel code path.
- **Heat soft-cap** `output_eff = output / (1 + (Heat/H_thresh)^2)` — smooth, never a hard wall.
- **Active-play bonuses** (Flux, Resonance, Overclock) are bounded ~1.5–3× peak and **must never gate progression** — the pure-idle path must reach everything.
- **Automation trails the frontier by ~one Scale** — newest content is hands-on, solved content runs itself. Never auto-solve the current frontier.
- **Anti-bloat:** scientific/letter notation past 1e6, per-Scale unit resets, and "production breakdown" tooltips that expose every multiplier (transparency is a feature).

## Phased build order

Implement in the order of design §10 (Phase 0 scaffold → Phase 8 endgame). Each phase is a runnable milestone; do not pull later-phase mechanics forward unless the data-driven spine already supports them cleanly. Phase goals to honor: Phase 1 must be "fun within 5 minutes"; gradual unlock (Scale 1 is *only* reactors→structure→Collapse) to avoid minute-one choice paralysis.
