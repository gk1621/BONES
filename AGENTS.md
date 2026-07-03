# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout
- The runnable product is **Motion Party Game**, a client-side browser game living in the `motion-party-game/` subdirectory. All commands below must be run from inside `motion-party-game/`.
- The `main` branch contains only asset/data files (`BONES.png`, `solana.tokenlist.json`); the app source lives on the feature branch(es). If `motion-party-game/` is not present, you are on a branch without the product.

### Stack & commands
- Vite 7 + Three.js + `@mediapipe/tasks-vision`, plain JavaScript ES modules, npm (see `motion-party-game/package.json`). Node 20.19+/22.12+ required.
- Dev server: `npm run dev` (Vite on port `5173`, bound to `0.0.0.0`). Build: `npm run build`. Preview built output: `npm run preview`.
- There is **no lint script and no test suite** defined; do not expect `npm run lint`/`npm test` to exist.

### Running / testing notes
- No backend, database, or secrets are needed — the app is fully client-side and persists high scores in browser `localStorage`.
- Webcam + MediaPipe motion tracking loads models from public CDNs (`cdn.jsdelivr.net`, `storage.googleapis.com`) and requires a camera; in the cloud VM there is no webcam, so use **Keyboard Demo Mode** to exercise gameplay.
- Manual test flow: Welcome → **Keyboard Demo Mode** → Player Setup (`Continue to Calibration`) → Calibration (`Skip (Keyboard Mode)`) → choose a mode → play. Keyboard: P1 = `A/D/W/S/Space`, P2 = arrows + `Enter`.
- A built-in QA panel (right side) and diagnostics (`Run Keyboard Smoke`) are available to self-verify screens/modes without a camera.
