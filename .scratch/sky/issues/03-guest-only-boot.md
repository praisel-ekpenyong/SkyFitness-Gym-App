# 03 — Guest-only static boot

**What to build:** Opening the app lands directly in an empty, fully working log. No login screen, no profile creation, no passkeys, no demo/example data, no calls of any kind to a backend. The store boots into guest mode unconditionally: server sync/pull/push, sign-out flows, remote config fetching and dirty-flag bookkeeping are removed, along with the demo seed generator and its gating. Login, admin-dashboard and account UI is gone from the shell and settings; the rest-timer alert falls back to local notification only. A happy-dom boot smoke test mounts the app and asserts: no login screen, no seeded history, main UI present.

**Blocked by:** 01 — Git baseline.

**Status:** ready-for-agent

- [ ] App boots straight to the main screen with an empty state on first run
- [ ] No network requests are made to any API path at boot or during use
- [ ] Demo seeding and its reset action no longer exist anywhere
- [ ] Login/passkey/account/admin UI and their code paths are removed from the shell, settings and store
- [ ] Rest-timer alerts work via local notifications without any server involvement
- [ ] JSON export/import still functions end-to-end after the surgery
- [ ] Boot smoke test passes (no login screen, no seed, main UI present)
- [ ] Full Vitest suite green
