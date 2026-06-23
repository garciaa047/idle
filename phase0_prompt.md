# Claude Code Prompt — AEON FORGE, Phase 0: Offline-First PWA Scaffold

## Context (read first)

You are building **AEON FORGE**, an incremental/idle game that will be developed in 9 phases (0–8). This is **Phase 0**. Your job here is **only** the engine scaffold and PWA plumbing plus one tiny placeholder resource to prove it works end-to-end. Do **not** build the real game mechanics yet — later phases add the production chain, prestige, scales, automation, etc. The single most important deliverable of this phase is a **clean, data-driven architecture** that later phases extend by adding *data*, not by rewiring engine code.

Constraints that shape everything:
- It ships as a **Progressive Web App** that must be **playable fully offline** after first load, and **installable to an iPhone Home Screen** (Safari). The developer has no Xcode and is on Windows.
- It will be hosted free on **GitHub Pages or Netlify** as plain static files. There is **no server** and there must be **no runtime network dependency** (no CDNs at runtime).

## Tech constraints

- **Vanilla HTML, CSS, and JavaScript only.** No frameworks (no React/Vue/etc.), no TypeScript, no bundler, **no build step**.
- Use **native ES modules** (`<script type="module">` + `import`/`export`) for code organization. (Dev runs over a local static server; production is served over https — both satisfy ES module CORS.)
- **No runtime third-party dependencies.** Everything must work offline with nothing to fetch. Dev-only tooling (a static file server) is fine.
- **Use relative paths everywhere** (`./...`) — for asset links, module imports, the service worker registration, and the manifest. The app must work identically whether served from a domain root (Netlify, `user.github.io`) or a subpath (`user.github.io/repo-name/`).
- Modern-Safari-compatible JS. No experimental syntax that current iOS Safari lacks.

## Required file structure

Repo root must be directly deployable to GitHub Pages / Netlify with no transformation.

```
index.html
manifest.webmanifest
sw.js                      # service worker (root scope; registered with a relative URL)
README.md                  # run / deploy / iPhone-install instructions (see Deliverables)
/css
  styles.css
/js
  main.js                  # entry point: boot, wire game loop + events, register SW
  /engine
    state.js               # default-state factory + SAVE_VERSION
    tick.js                # advance(seconds) + per-step simulation; offline-composable
    save.js                # localStorage autosave, export/import, hard reset, migrations
    offline.js             # elapsed time -> effective seconds (saturating cap)
    format.js              # number formatting util
    constants.js           # tunable gameplay/config constants in one place
  /content
    resources.js           # resource DEFINITIONS as data
    generators.js          # generator DEFINITIONS as data (one placeholder this phase)
  /ui
    render.js              # render DOM from state (decoupled from tick)
    panels.js              # offline-gains modal + settings/save panel
/icons
  icon.svg
  icon-180.png             # apple-touch-icon
  icon-192.png             # manifest
  icon-512.png             # manifest
```

## Architecture spec (the important part)

**1. Strict state / content separation.**
- `state` is a single plain serializable object — the entire save. It holds only data that must persist: resource amounts, owned generator counts, timestamps, settings, flags, and `version`. Nothing else stores game data; the engine reads `content` definitions and mutates `state`.
- `content` (in `/js/content/*`) defines static, non-saved definitions as data arrays/objects keyed by `id`: each resource (`id`, display name, etc.) and each generator (`id`, name, `baseCost`, `costGrowth` r, `baseRate`, which resource it produces). **Adding a generator in a later phase = adding one object here, with no engine changes.** Design the engine around this guarantee.

**2. Simulation: one code path for online and offline.**
- Implement `advance(seconds)` in `tick.js`: it advances the simulation by `seconds` of game time by mutating `state`. It must be **composable** — running `advance` once over total elapsed time must give (approximately) the same result as running it in many small steps. This invariant is what makes offline progress correct as mechanics get non-linear later.
- Implement it by chunking `seconds` into fixed sub-steps no larger than `MAX_STEP` (e.g. 1.0s), calling a `stepSimulation(dt)` for each, with a bounded total step count (e.g. cap ~1000 sub-steps and fold any remainder into a final larger step) so a huge input can never freeze the UI. `stepSimulation(dt)` is the single place production/consumption math lives.
- **Online loop** (`main.js`): a `requestAnimationFrame` loop computes real delta-time per frame, clamps it (e.g. max 1–2s to absorb tab-lag spikes), and calls `advance(dt)`.
- **Offline** is just `advance(effectiveSeconds)` where `effectiveSeconds` comes from the offline module below — **reuse the same `advance`**, do not write a separate offline math path.

**3. Offline progress (saturating cap).**
- In `offline.js`: on load, compute `elapsed = max(0, now - state.lastSaved)` seconds (clamp negatives from clock changes). Convert to effective seconds with a saturating curve:
  `effective = T_CAP * (1 - exp(-elapsed / T_CAP))`
  where `T_CAP` (default 7200s = 2h) lives in `constants.js`. Then call `advance(effective)`.
- After applying, show an **offline-gains modal** (in `panels.js`) reporting time away and amount gained, and note transparently that offline production saturates at ~`T_CAP`. Only show the modal if meaningful time passed (e.g. > ~30s).

**4. Render decoupled from simulation.**
- `render.js` reads `state` + `content` and updates the DOM. It never mutates `state`. Throttle DOM updates to ~20–30fps (or only when displayed values change) to save iPhone battery during long idle sessions — the simulation can tick every frame, but the DOM doesn't need to.

**5. Save system + versioning/migrations.**
- Autosave to `localStorage` every `AUTOSAVE_INTERVAL` (default 15s). **Also save on `visibilitychange` → hidden and on `pagehide`** (these are the reliable backgrounding hooks on iOS Safari; do **not** rely on `beforeunload` on mobile). Save writes `state.lastSaved = Date.now()`.
- **Export / Import / Hard Reset** in the settings panel: Export serializes the save to a copyable string (base64-encoded JSON is fine); Import parses a pasted string back into `state`; Hard Reset wipes the save behind a confirm. These are the safety net against iOS evicting site storage, so make them obvious and reliable.
- Include `SAVE_VERSION` (start at `1`) and a **migration scaffold**: on load, if a saved game's `version` is older, run an ordered list of migration functions to bring it up to current. Phase 0 has no migrations yet, but the framework must exist so later schema changes never break old saves.
- Call `navigator.storage.persist()` on boot (best-effort) to request persistent storage.

**6. Number formatting.**
- `format.js` exposes `format(n)` returning compact strings: plain integers small, then `K`/`M`/`B`/`T` suffixes, then scientific notation (e.g. `1.23e9`) past a threshold. Used everywhere numbers display.

## PWA requirements

- **`manifest.webmanifest`**: `name`, `short_name` ("Aeon Forge"), `start_url: "./"`, `scope: "./"`, `display: "standalone"`, `orientation: "portrait"`, a `background_color` and `theme_color` (dark), and the 192 + 512 icons. Link it from `index.html` with a relative href.
- **`sw.js`**: precache the full app shell (index.html, css, every JS module, manifest, icons) on `install`; serve **cache-first** for these (no runtime network needed); on `activate`, delete caches not matching the current `CACHE_VERSION` constant. Bumping `CACHE_VERSION` is how updates propagate — document this in the README. Use `skipWaiting()` + `clients.claim()` so a fresh deploy activates promptly (acceptable for a solo dev). Register the SW from `main.js` with a **relative** URL, guarded by a `file://` check so it degrades gracefully.
- **iOS meta tags in `index.html`**: include `apple-mobile-web-app-capable` = yes (and standard `mobile-web-app-capable`), `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, and an `apple-touch-icon` link to `icon-180.png` (iOS uses PNG here). Note in the README that **iOS does not fire `beforeinstallprompt`**, so installation is manual via Share → Add to Home Screen — do not attempt a programmatic install prompt this phase.
- **Viewport / touch handling**: viewport meta with `viewport-fit=cover`; respect safe-area insets (`env(safe-area-inset-*)`) so nothing is clipped by the notch or home indicator. Prevent double-tap-to-zoom and pinch-zoom (the game is tap-heavy later), prevent overscroll/rubber-band bounce, and disable text selection on tappable UI.
- **Icons**: generate a simple placeholder mark (a clean geometric "forge/lattice" glyph on a dark background) as `icon.svg`, and produce `icon-180/192/512.png` from it. These are explicitly placeholders to be redesigned in Phase 8 — keep it quick, don't rabbit-hole on art.

## Phase 0 content scope (placeholder only)

Define exactly enough to prove the architecture works:
- **One resource: Energy.** Trickles up at a base rate (`BASE_ENERGY_RATE`, default 1/sec) from the start so the screen is visibly alive immediately.
- **One generator: "Collector."** `baseCost` 10 Energy, `costGrowth` r = 1.15, each owned adds +1 Energy/sec. Buying deducts current cost from Energy and increments the owned count; cost shown is the geometric next-purchase cost.

This single resource + generator must exercise the whole loop: config-driven definition → simulation produces Energy → buying mutates state with geometric cost → render reflects it → autosave persists it → offline-resume applies capped gains. **Do not** add a production chain, prestige, scales, upgrades, or any other future-phase mechanic.

## UI scope (minimal, clean, mobile-first)

Placeholder-level styling only — real polish/juice is Phase 8. Aim for a clean **dark cosmic** look, legible typography, and a single-column layout that fits a narrow iPhone viewport with safe-area padding. Include:
- A header (app title) and a live **Energy** readout with its per-second rate.
- The **Collector** row: name, owned count, formatted cost, and a Buy button (disabled/greyed when unaffordable).
- A **settings/save** panel (toggle or section): Export, Import, Hard Reset, plus a tiny line of install hint text ("Add to Home Screen via the Share menu to install").
- The **offline-gains modal** shown on resume.
Do not invest in animations, particles, or themed art beyond basic clean CSS.

## Definition of done — verify these

Local (you can self-test):
1. Served via a local static server, the app loads with **no console errors**.
2. Energy rises continuously; the per-second rate is shown.
3. Buying a Collector deducts Energy, increments count, raises the next cost geometrically (×1.15), and increases the rate.
4. Autosave works: reload restores resources, owned counts, and settings.
5. Offline-resume: note Energy, background/close the tab, wait ~1 minute, reopen → the offline modal reports time away and Energy gained, and the gain matches the saturating-cap behavior.
6. Export produces a copyable string; Import restores from it into a fresh state; Hard Reset wipes behind a confirm.
7. The simulation gives consistent totals whether run live at 60fps or via a single large `advance()` call (the offline-composability invariant holds).

On-device (document in README for the developer to run):
8. Deployed to GitHub Pages or Netlify (https), opened in iPhone Safari, then **Share → Add to Home Screen**; launched from the icon it opens **standalone** (no Safari chrome), respecting safe-area insets.
9. With the app installed, enable **Airplane Mode** and relaunch → it still loads and runs **fully offline**, Energy still accrues, and offline gains still apply.

## Deliverables

- All files above, working, in the structure given.
- `constants.js` containing every tunable in one place (`BASE_ENERGY_RATE`, Collector `baseCost`/`costGrowth`/`baseRate`, `T_CAP`, `AUTOSAVE_INTERVAL`, `MAX_STEP`, `CACHE_VERSION`, `SAVE_VERSION`) so balancing is centralized.
- `README.md` with: (a) how to run locally on Windows (e.g. `python -m http.server` then open `http://localhost:8000`, explaining ES modules need a server not `file://`); (b) how to deploy to GitHub Pages and to Netlify; (c) how to Add to Home Screen on iPhone and verify offline; (d) the note that bumping `CACHE_VERSION` is required to ship updates past the service worker.
- Brief inline comments at module boundaries explaining the state/content split, the `advance()` composability invariant, and the migration framework, so the next phase can extend cleanly.

## Do NOT

- No frameworks, no TypeScript, no bundler, no build step, no package.json runtime deps.
- No CDN or any runtime network fetch — offline must be airtight.
- No absolute paths — relative only.
- No future-phase mechanics (no production chain, prestige, scales, upgrades, automation, Flux, etc.).
- No heavy art, animations, or visual juice — that is Phase 8.
- Do not attempt a programmatic install prompt on iOS — it isn't supported there.
