# AEON FORGE

An offline-first incremental/idle game of cosmic-scale automation, shipped as a **Progressive Web App** — vanilla HTML/CSS/JS, no build step, no runtime network dependency. **Phase 1** delivers the **Scale 1 ("Quantum Foam")** core loop on top of the Phase 0 engine: a Reactor → Extractor → Fabricator production chain (with input-throttled efficiency), a stackable multiplier system, the **Overclock** active surge, and the **Collapse** prestige that mints **Singularity (σ)** to spend in a persistent upgrade shop.

## Run locally (Windows)

ES modules require an **http server** — opening `index.html` as a `file://` URL will fail CORS and the service worker won't register. Serve the folder over `localhost` instead:

```sh
# from the repo root
python -m http.server 8000
```

Then open **http://localhost:8000** in a browser. Any static file server works (`npx serve`, VS Code "Live Server", etc.).

## Deploy (free static hosting)

The repo root is directly deployable with no transformation — all paths are **relative**, so it works identically from a domain root or a project subpath (`user.github.io/repo-name/`).

**GitHub Pages**
1. Push this repo to GitHub.
2. Settings → Pages → Source: deploy from branch, pick your branch and `/ (root)`.
3. Wait for the build; your app is live at `https://<user>.github.io/<repo>/`.

**Netlify**
1. New site → import from Git (or drag-and-drop the folder into the Netlify dashboard).
2. No build command; publish directory is the repo root (`.`).
3. Deploy.

HTTPS (which both provide) is required for the service worker and for installation.

## Install on iPhone (Add to Home Screen)

iOS does **not** support a programmatic install prompt (`beforeinstallprompt` never fires in Safari), so installation is manual:

1. Open the deployed **https** URL in **Safari** (not Chrome).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Launch from the new Home Screen icon — it opens **standalone** (no Safari chrome), respecting the notch/home-indicator safe areas.

**Verify offline:** with the app installed, enable **Airplane Mode**, then relaunch from the icon. It should load and run fully offline; Energy keeps accruing and offline gains apply on resume.

> **Tip:** Use **Export** in the settings panel (⚙) periodically to copy your save string somewhere safe. iOS can evict site storage for PWAs that go unused, and Export/Import is the recovery path.

## Shipping updates (important)

The service worker serves the app **cache-first**, so a deploy alone will **not** reach already-installed clients. To push any change live you must **bump `CACHE_VERSION`** in both:

- `sw.js` (the cache key — this is what triggers re-precaching and old-cache cleanup), and
- `js/engine/constants.js` (kept in sync for reference).

On the next launch the new service worker installs the fresh shell, deletes the old cache, and `skipWaiting()` + `clients.claim()` activate it promptly.

## Architecture

- **State / content split.** `state` (`js/engine/state.js`) is the entire save: a plain serializable object of amounts, owned counts, timestamps, settings, flags, and `version`. `content` (`js/content/*`) holds static definitions as data keyed by `id`. **Adding a resource or generator later = adding one data object; the engine never changes.**
- **One simulation path.** `advance(state, seconds)` (`js/engine/tick.js`) chunks time into fixed sub-steps and runs all math in `stepSimulation(dt)`. It is **composable**: one big call ≈ many small calls. The live `requestAnimationFrame` loop and offline catch-up both call the *same* `advance` — there is no separate offline math path.
- **Offline (saturating cap).** `js/engine/offline.js` turns wall-clock time away into `effective = T_CAP * (1 - e^(-elapsed/T_CAP))` (default `T_CAP` = 2h), then feeds it to `advance`.
- **Render decoupled.** `js/ui/render.js` reads state and writes the DOM (throttled ~30fps, skips no-op writes); it never mutates state.
- **Saves + migrations.** `js/engine/save.js` autosaves every 15s plus on `visibilitychange→hidden` and `pagehide` (the reliable iOS backgrounding hooks). It carries `SAVE_VERSION` and an ordered **migration framework** so future schema changes never break old saves. Export/Import use base64-encoded JSON.

All tunables live in `js/engine/constants.js`.
