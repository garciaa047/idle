// constants.js — every tunable gameplay/config value in one place.
// Balancing happens here so no magic numbers leak into engine logic.

// --- Save / cache versioning ---
export const SAVE_VERSION = 2;      // bump when state schema changes (add a migration)
export const CACHE_VERSION = 'aeon-forge-v2'; // bump to ship updates past the service worker

// --- Simulation ---
export const MAX_STEP = 1.0;        // largest sub-step (seconds) for stepSimulation()
export const MAX_SUBSTEPS = 1000;   // cap sub-step count; remainder folds into one final step
export const FRAME_DT_CLAMP = 2.0;  // clamp per-frame real delta to absorb tab-lag spikes (s)

// --- Save persistence ---
export const AUTOSAVE_INTERVAL = 15; // seconds between autosaves

// --- Offline progress ---
export const T_CAP = 7200;          // saturating cap (seconds) ~= 2 hours
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
