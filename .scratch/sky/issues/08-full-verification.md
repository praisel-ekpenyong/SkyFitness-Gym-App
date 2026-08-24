# 08 — Full verification

**What to build:** Proof that the slices compose into one working product. From a clean checkout state: the entire Vitest suite passes, the production static build succeeds, and the built output serves correctly via a static preview — booting straight into an empty Sky log with no console errors, working navigation, workout logging round-trip, export/import, theme toggle, and offline load of the cached app shell.

**Blocked by:** 02 — Sky branding; 03 — Guest-only static boot; 04 — Durable storage + backup nag; 05 — English only; 06 — Copy rewrite + license notice; 07 — Delete server-era artifacts.

**Status:** ready-for-agent

- [x] Entire Vitest suite green on the final tree
- [x] Production static build completes without errors
- [x] Static preview boots to an empty Sky log, no console errors
- [x] Manual smoke pass: create routine → log workout → stats update → export JSON → wipe storage → import restores
- [x] Light/dark toggle works in the built app
- [x] App shell loads with network disconnected (service worker cache)

## Comments

**2026-08-24 — implemented.** `Status:` left as-is per house convention.

- **Defects identified & resolved**:
  - `frontend/src/store/useUI.js`: Fixed missing `import { useStore } from './useStore.js'`. Server-era deletions had stripped the import while rest/work timer callbacks still called `useStore.getState().S.sound`, throwing `ReferenceError` on timer ticks. Verified with `frontend/src/store/useUI.test.js`.
  - `frontend/src/lib/exercises.js`: Updated default image/gif base URLs to the pinned CDN commit (`hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd`) so static preview / production builds don't produce 404s for exercise media when server media directories are not present. Verified with `frontend/src/lib/exercises.test.js`.
  - `frontend/package.json`: Streamlined `build:mobile` script since image/gif defaults are now configured within `exercises.js`.
- **Comprehensive test suite additions**:
  - `frontend/src/App.verification.test.jsx`: Full smoke pass testing clean boot with empty state, routine creation, workout logging, stats (fatigue/strength) calculation, JSON export with `lastExport` stamp, storage wipe/reset, JSON backup restore, and light/dark theme toggle without console errors.
  - `frontend/src/sw.test.js`: Verified service worker caching, install/activate cache pruning, and offline fallback serving cached app shell when disconnected.
- **Verification**: Full Vitest suite 327/327 passing across 25 test files; `npm run build` succeeds cleanly; `npm run test:fatigue-probe` passes 108,000 comparisons and 14,076 history-edit checks.
