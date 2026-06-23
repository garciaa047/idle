// constants.js — every tunable gameplay/config value in one place.
// Balancing happens here so no magic numbers leak into engine logic.

// --- Save / cache versioning ---
export const SAVE_VERSION = 1;      // bump when state schema changes (add a migration)
export const CACHE_VERSION = 'aeon-forge-v1'; // bump to ship updates past the service worker

// --- Simulation ---
export const MAX_STEP = 1.0;        // largest sub-step (seconds) for stepSimulation()
export const MAX_SUBSTEPS = 1000;   // cap sub-step count; remainder folds into one final step
export const FRAME_DT_CLAMP = 2.0;  // clamp per-frame real delta to absorb tab-lag spikes (s)

// --- Save persistence ---
export const AUTOSAVE_INTERVAL = 15; // seconds between autosaves

// --- Offline progress ---
export const T_CAP = 7200;          // saturating cap (seconds) ~= 2 hours
export const OFFLINE_MIN_SECONDS = 30; // only show the offline modal past this much time away

// --- Phase 0 placeholder content tunables ---
export const BASE_ENERGY_RATE = 1;  // passive Energy/sec from the start, screen feels alive

export const COLLECTOR_BASE_COST = 10;    // first Collector cost (Energy)
export const COLLECTOR_COST_GROWTH = 1.15; // geometric cost multiplier r per owned
export const COLLECTOR_BASE_RATE = 1;      // Energy/sec added per owned Collector
