# 03 — Guest-only static boot

**What to build:** Opening the app lands directly in an empty, fully working log. No login screen, no profile creation, no passkeys, no demo/example data, no calls of any kind to a backend. The store boots into guest mode unconditionally: server sync/pull/push, sign-out flows, remote config fetching and dirty-flag bookkeeping are removed, along with the demo seed generator and its gating. Login, admin-dashboard and account UI is gone from the shell and settings; the rest-timer alert falls back to local notification only. A happy-dom boot smoke test mounts the app and asserts: no login screen, no seeded history, main UI present.

**Blocked by:** 01 — Git baseline.

**Status:** ready-for-agent

- [x] App boots straight to the main screen with an empty state on first run
- [x] No network requests are made to any API path at boot or during use
- [x] Demo seeding and its reset action no longer exist anywhere
- [x] Login/passkey/account/admin UI and their code paths are removed from the shell, settings and store
- [x] Rest-timer alerts work via local notifications without any server involvement
- [x] JSON export/import still functions end-to-end after the surgery
- [x] Boot smoke test passes (no login screen, no seed, main UI present)
- [x] Full Vitest suite green

## Comments

**2026-08-24 — implemented.** Frontend-only surgery; `Status:` left as-is per house convention.

- **Store** (`store/useStore.js`): rewrote local-only. `user`/`config`/`loadConfig`/`setUser`/guest flags/`pushState`/`pullState`/sign-out flows/dirty-flag bookkeeping/demo gating all gone. `boot()` now only restores the newest native mirror (mobile), re-stamps the reminder timezone, and flips `ready`. `replaceState(S)` lost its second argument — both call sites in Settings updated.
- **Deleted**: `views/Login.jsx`, `views/Admin.jsx`, `lib/api.js`, `lib/guest.js` (+test), `lib/push.js`, `lib/demo.js`, `lib/demoSeed.js` (+test), and `lib/audit.js` (+test) — the admin activity-log renderer was orphaned by Admin's removal.
- **App shell** (`App.jsx`, `TabBar.jsx`, `Home.jsx`): authed gate reduced to `ready`; `/admin` route removed; header fixed to "Sky".
- **Views**: `Workout.jsx` lost the admin presence heartbeat (`/api/activity` + sendBeacon); `sheets.jsx` no longer reads a user name for plan bundles; `useUI.js` rest-timer path dropped push calls — native local notification retained.
- **Settings.jsx**: account section replaced with a static "Your data" row (all data stays on this device); dead `PushCard` (service-worker push) and `RegisterInline` (passkey registration) functions deleted; Tip-section copy no longer branches on `user`; `IS_ANDROID` is now computed locally instead of imported from the deleted Login module.
- **Boot smoke test**: new `src/App.boot.test.jsx` (happy-dom) mounts `<App>`, asserts `#tabbar` present, Home/Stats text visible, no sign-in/guest/profile strings, empty workouts/routines, and `fetch` never called (mocked fetch rejects on use). Written red first (`#tabbar` null while Login still gated boot), green after surgery.
- **Verification**: grep of `frontend/src` shows zero hits for `/api/`, `api(`, `gym_guest`/`gym_user`/`gym_dirty`, `DEMO`, passkey/webauthn/signOut flows, guest/sync store actions (remaining hits: locale string packs → ticket 05/06; browser `history.pushState` in Modals; CDN media URLs → allowed). Full Vitest suite 311/311 across 20 files; `npm run build` succeeds.
