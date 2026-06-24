// constants.js — every tunable gameplay/config value in one place.
// Balancing happens here so no magic numbers leak into engine logic.

// --- Save / cache versioning ---
export const SAVE_VERSION = 4;      // bump when state schema changes (add a migration)
export const CACHE_VERSION = 'aeon-forge-v4'; // bump to ship updates past the service worker

// --- Simulation ---
export const MAX_STEP = 1.0;        // largest sub-step (seconds) for stepSimulation()
export const MAX_SUBSTEPS = 1000;   // cap sub-step count; remainder folds into one final step
export const FRAME_DT_CLAMP = 2.0;  // clamp per-frame real delta to absorb tab-lag spikes (s)

// --- Save persistence ---
export const AUTOSAVE_INTERVAL = 15; // seconds between autosaves

// --- Offline progress ---
// T_CAP is now DERIVED (Phase 3): T_CAP_BASE + Temporal Reservoir bonus. See
// tCapOf() in content/aeon.js. The saturating curve itself is unchanged.
export const T_CAP_BASE = 7200;     // base saturating cap (seconds) ~= 2 hours
export const OFFLINE_MIN_SECONDS = 30; // only show the offline modal past this much time away

// --- Scale 1 ("Quantum Foam") economy ---------------------------------------
// Bootstrap seed: enough Structure to buy the first Reactor + Extractor + Fabricator.
export const SEED_STRUCTURE = 35;

// Reactor — produces Energy.
export const REACTOR_BASE_COST = 10;     // Structure
export const REACTOR_COST_GROWTH = 1.13;
export const REACTOR_RATE = 2;           // +Energy/sec per owned unit

// Extractor — produces Matter.
export const EXTRACTOR_BASE_COST = 10;   // Structure
export const EXTRACTOR_COST_GROWTH = 1.13;
export const EXTRACTOR_RATE = 2;         // +Matter/sec per owned unit

// Fabricator — consumes Energy + Matter, produces Structure.
// At the rates below the natural balance is 1 Reactor : 1 Extractor : 2 Fabricators.
export const FABRICATOR_BASE_COST = 10;  // Structure
export const FABRICATOR_COST_GROWTH = 1.15;
export const FABRICATOR_RATE = 1;            // +Structure/sec per unit at full efficiency
export const FABRICATOR_CONSUME_ENERGY = 1;  // Energy/sec drawn per unit
export const FABRICATOR_CONSUME_MATTER = 1;  // Matter/sec drawn per unit

// --- Collapse (prestige -> Singularity σ) -----------------------------------
// σ = floor( K_SIGMA * (structureThisCollapse / S_REF) ^ 0.5 ). The √ is the
// intentional sublinearity — doubling output does not double σ.
export const K_SIGMA = 1;
export const S_REF = 100;           // also the minimum gate: need >= S_REF to grant 1 σ.

// --- Overclock (active surge) ----------------------------------------------
export const OVERCLOCK_MULT = 3;        // ×production while active (target: all)
export const OVERCLOCK_DURATION = 15;   // seconds the surge lasts
export const OVERCLOCK_COOLDOWN = 60;   // seconds of cooldown AFTER the surge ends

// --- σ-upgrade tunables (effects + cost curves) -----------------------------
// Each upgrade's effect factor is applied as base^level; cost is coef * growth^level.
export const UP_FAB_YIELD_FACTOR = 1.20;   // ×Structure production per level
export const UP_THROUGHPUT_FACTOR = 1.20;  // ×Energy AND Matter production per level
export const UP_RESONANCE_FACTOR = 1.10;   // ×ALL production per level (global compounder)
export const UP_COLLAPSE_YIELD_STEP = 0.10; // +10% σ-gained per level (additive)

export const UP_FAB_YIELD_COST = [1, 2];     // 1 * 2^level  σ
export const UP_THROUGHPUT_COST = [1, 2];    // 1 * 2^level  σ
export const UP_RESONANCE_COST = [2, 3];     // 2 * 3^level  σ
export const UP_COLLAPSE_YIELD_COST = [3, 4]; // 3 * 4^level  σ

// --- Phase 2: Refinement chain (the converter ladder deepens within the run) ---
// The ladder is Fabricator(0) -> Assembler(1) -> Synthesizer(2) -> Integrator(3).
// `unlockedDepth` (0..3) = how many UPPER tiers are unlocked; a converter at
// chainIndex i is active iff i <= unlockedDepth, and the HIGHEST active converter
// produces Structure while every lower one feeds its tier resource. (See
// activeOutput() in generators.js — this is the one uniform rule, no per-tier code.)
export const TIER_MULT = 1.5;        // units/sec an UPPER converter makes per owned unit
export const TIER_UNLOCK_MULT = 2;   // permanent ×all production granted PER depth unlocked

// Upper-converter cost curves (all priced in Structure). Fabricator stays Phase 1's.
export const ASSEMBLER_BASE_COST = 200;
export const ASSEMBLER_COST_GROWTH = 1.15;
export const SYNTHESIZER_BASE_COST = 5e3;
export const SYNTHESIZER_COST_GROWTH = 1.16;
export const INTEGRATOR_BASE_COST = 1e5;
export const INTEGRATOR_COST_GROWTH = 1.17;

// lifetimeStructure (cumulative Structure EVER produced) thresholds that unlock
// depth 1, 2, 3. With these, the first Collapse naturally precedes the first
// deepening, so onboarding order (simple loop -> Collapse -> chain) is preserved.
export const UNLOCK_THRESHOLDS = [5e3, 5e5, 5e7];

// --- Phase 2: Resonance pickups (active burst reward, the "golden cookie") ----
export const RESONANCE_MIN = 60;      // min seconds between spawns (visible only)
export const RESONANCE_MAX = 180;     // max seconds between spawns
export const RESONANCE_LIFETIME = 12; // seconds on screen before it drifts away
// Weighted reward table (must sum to 1).
export const RESONANCE_WEIGHTS = { surge: 0.45, cache: 0.35, flux: 0.20 };
export const SURGE_MULT = 7;          // ×all production while a Surge is active
export const SURGE_DURATION = 30;     // seconds a Surge lasts
export const CACHE_SECONDS = 90;      // Cache reward = this many sec of current Structure output
export const RESONANCE_FLUX_BURST = 30; // Flux-burst reward amount (on top of the catch bonus)

// --- Phase 2: Flux (active-only currency funding strategic, bounded boosts) ----
export const FLUX_CAP = 100;
export const FLUX_GAIN_OVERCLOCK = 10;  // per Overclock tap
export const FLUX_GAIN_RESONANCE = 15;  // per Resonance caught (any reward)
export const FLUX_TRICKLE = 0.5;        // +Flux/sec while the document is VISIBLE
export const FLUX_DRAIN = 1;            // -Flux/sec while the document is HIDDEN
// Abilities (spend Flux; bounded, wall-clock-bounded effects).
export const OVERDRIVE_COST = 40;
export const OVERDRIVE_MULT = 5;        // ×all production
export const OVERDRIVE_DURATION = 60;   // seconds
export const CONVERGENCE_COST = 30;
export const CONVERGENCE_SECONDS = 60;  // fill each intermediate stock to this many sec of demand
export const SINGULARITY_FOCUS_COST = 50;
export const SINGULARITY_FOCUS_BONUS = 0.5; // +50% σ on the NEXT Collapse

// --- Phase 3: Ascend (hard reset) + Aeons (Æ) -------------------------------
// Ascend converts a Scale's banked σ into permanent, cross-Scale Æ. The gate is
// "experienced the full Scale" (chain fully deepened) AND "built meaningful σ".
export const ASCEND_SIGMA_REQ = 50;  // sigmaThisScale needed (plus unlockedDepth == 3)
// Æ = floor( AEON_A * currentScale^AEON_Q * log10(1 + sigmaThisScale) ).
// Scale^Q rewards depth; log10 keeps σ from exploding the payout.
export const AEON_A = 1;
export const AEON_Q = 1.5;

// --- Phase 3: Aeon shop (permanent, global, cross-Scale; Phase 6 grows the tree) ---
export const AEON_RESONANT_FACTOR = 1.5;     // ×all production per level
export const AEON_INSIGHT_FACTOR = 1.25;     // σ gain × per level
export const TEMPORAL_RESERVOIR_STEP = 3600; // +seconds to the offline cap per level
export const AEON_RESONANT_COST = [1, 3];    // 1 * 3^level  Æ
export const AEON_INSIGHT_COST = [2, 3];     // 2 * 3^level  Æ
export const AEON_TEMPORAL_COST = [2, 4];    // 2 * 4^level  Æ
export const AEON_AUTOMATION_COST = [3, 4];  // 3 * 4^level  Æ

// --- Phase 3: Automator (first auto-buy; unlocked on first Ascend) -----------
export const AUTOMATOR_BUY_CAP = 50;         // max generator buys per automator run
export const AUTOMATOR_INTERVAL = 0.25;      // seconds between automator runs (a few/sec)
export const AUTOMATOR_DEFAULT_RESERVE = 0;  // percent of Structure kept unspent by default
