# 08 — Full verification

**What to build:** Proof that the slices compose into one working product. From a clean checkout state: the entire Vitest suite passes, the production static build succeeds, and the built output serves correctly via a static preview — booting straight into an empty Sky log with no console errors, working navigation, workout logging round-trip, export/import, theme toggle, and offline load of the cached app shell.

**Blocked by:** 02 — Sky branding; 03 — Guest-only static boot; 04 — Durable storage + backup nag; 05 — English only; 06 — Copy rewrite + license notice; 07 — Delete server-era artifacts.

**Status:** ready-for-agent

- [ ] Entire Vitest suite green on the final tree
- [ ] Production static build completes without errors
- [ ] Static preview boots to an empty Sky log, no console errors
- [ ] Manual smoke pass: create routine → log workout → stats update → export JSON → wipe storage → import restores
- [ ] Light/dark toggle works in the built app
- [ ] App shell loads with network disconnected (service worker cache)
