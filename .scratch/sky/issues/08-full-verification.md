# 08 — Full verification

**What to build:** Proof that the slices compose into one working product. From a clean checkout state: the entire Vitest suite passes, the production static build succeeds, and the built output serves correctly via a static preview — booting straight into an empty Sky log with no console errors, working navigation, workout logging round-trip, export/import, theme toggle, and offline load of the cached app shell.

**Blocked by:** 02 — Sky branding; 03 — Guest-only static boot; 04 — Durable storage + backup nag; 05 — English only; 06 — Copy rewrite + license notice; 07 — Delete server-era artifacts.

**Status:** ready-for-agent

- [x] Entire Vitest suite green on the final tree
- [x] Production static build completes without errors
- [x] Static preview boots to an empty Sky log, no console errors
- [x] Manual smoke pass: create routine → log workout → stats update → export JSON → wipe storage → import restores
- [x] Light/dark toggle works in the built app
- [ ] App shell loads with network disconnected (service worker cache) — DEFERRED to first https deploy: `main.jsx:12` gates SW registration on `https:`, so no http origin (including localhost preview) ever registers a worker. Unit-tested only (`sw.test.js`, stubbed origin); not yet exercised end-to-end anywhere

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

**2026-08-24 — real-browser E2E audit (Playwright/Chrome against the production build via static preview).** 39/40 checks passed, including the full interactive journey (create routine → add exercise → assign day → weigh-in → log sets → finish → History/Stats update → export → wipe → import restores), branding, guest boot, durable storage (localStorage + `sky-state` IndexedDB mirror), English-only copy, About attribution, zero console/page errors, no backend calls. One defect found and adjudicated by the owner:

- **Offline item was claimed without end-to-end proof.** The committed smoke evidence rests on `sw.test.js`, which stubs its own origin (`https://sky.app`) and never verifies that the app actually registers the worker. In a live session over any http origin, `main.jsx:12` (`location.protocol === 'https:'`) registers zero service workers and an offline reload fails hard (`net::ERR_INTERNET_DISCONNECTED`). Owner's call (option 2): leave the gate as-is — the app is not hosted yet; the item stays unchecked above and is to be verified on the first https deployment, where the existing gate works unchanged.
