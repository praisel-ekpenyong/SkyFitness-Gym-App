Status: ready-for-agent

# Sky — a personal, backend-free fork of openGym

## Problem Statement

The user trains with an iPhone and wants a gym tracker they fully control. Upstream openGym is built to be self-hosted: it needs Docker and a Node server, signs people in with passkeys, syncs profiles across devices, and carries an admin dashboard, twelve languages and an MCP server the user will never use. The user has no Docker, does not want to run a server, does not want a login feature — but absolutely needs their training history to survive on their phone.

Running upstream as-is is not an option; using its demo build as-is would put fake example data into their real log and leave their only copy of that log in the most evictable storage iOS offers.

## Solution

Sky: the same app, collapsed into a pure static frontend that runs anywhere static files run (local dev server now; GitHub Pages / Netlify / Vercel later). The existing guest mode becomes the only mode: no login screen, no accounts, no server calls, no seeded demo data — the app boots empty and ready for real history.

Branding changes from openGym to Sky: green & white accents, light theme by default (dark stays available), name changed in every user-visible place. Data durability is hardened: every state save mirrors localStorage into IndexedDB, boot restores whichever copy is newer, and a gentle reminder nags when no export has been taken lately. JSON export/import stays as the escape hatch, along with all the importers (Strong / Hevy / FitNotes / Apple Health weight / CSV) in case old history ever needs bringing in.

Server-era code (API, auth, admin, push, nginx/Docker/CI packaging) and the non-English locales are removed rather than left dormant: the goal is a codebase the owner can hold in their head.

## User Stories

1. As a solo trainer, I want to open the app and land straight in my log with no login or profile creation, so that nothing stands between me and recording a set.
2. As a solo trainer, I want the app to start completely empty on first run, so that my real history is never polluted with example data.
3. As a solo trainer, I want every change I make saved automatically to two browser storages (localStorage and IndexedDB), so that a workout logged between sets survives even if one storage is evicted.
4. As a solo trainer, I want boot to pick the newest of the stored copies, so that a partially evicted storage cannot silently roll my log back.
5. As an iPhone owner, I want my data kept in IndexedDB as well as localStorage, so that Safari reclaiming website data under storage pressure cannot erase my year of training.
6. As a careless-at-times athlete, I want a reminder when I have not exported a backup recently, so that losing my phone does not mean losing my history.
7. As a cautious athlete, I want one-tap JSON export and import, so that I can move or restore my full history at any time.
8. As a switcher from other apps, I want the Strong / Hevy / FitNotes / Apple Health / CSV importers available in Settings, so that I can bring past history in whenever I decide to.
9. As the owner of this fork, I want the app named "Sky" everywhere I can see it (title, home-screen name, About), so that it feels like mine.
10. As a daytime lifter, I want light theme by default with green & white accents, so that the app matches how I actually use it.
11. As a night-session lifter, I want the dark theme still one toggle away, so that early mornings don't blind me.
12. As a user installing the app to my home screen, I want the PWA manifest, icons, service worker and offline support preserved, so that it behaves like a proper installed app.
13. As a visual learner, I want exercise animations to keep loading from the CDN dataset, so that demos work without bundling 140 MB into the app.
14. As an English speaker, I want only English shipped, so that the bundle is smaller and there is less surface to maintain.
15. As the sole operator, I want the login, passkey, account, admin-dashboard and server-sync code paths gone entirely, so that no dead code confuses future changes.
16. As the sole operator, I want the Node API, nginx web container, MCP server and Docker/CI configs deleted, so that the repo contains only what runs.
17. As a developer of my own app, I want the repo under git from before any edits, so that every customization is reviewable against a pristine upstream baseline.
18. As someone who may want upstream improvements later, I want the baseline commit to correspond exactly to upstream v1.2.9, so that merges or diffs remain possible even after aggressive stripping.
19. As a user on free hosting, I want the production build emitted as static files with relative paths, so that it deploys unchanged to any host and subdirectory.
20. As a developer without Docker, I want `vite dev` plus a static preview to be the complete local workflow, so that I never need a backend running.
21. As a privacy-minded user, I want no telemetry, no analytics and no outbound calls except the exercise-media CDN, so that my training data never leaves my device.
22. As the app's only user, I want guest-mode persistence quirks removed (no dirty flags, no config fetches, no sign-out semantics), so that state handling is simple and predictable.
23. As a reader of the About page, I want honest text about what Sky is and where it came from, including its AGPL license notice, so that attribution is correct.
24. As a user who trains offline, I want logging, planning and stats to work with no network at all, so that a basement gym session loses nothing.
25. As the owner, I want the existing Vitest suite to stay green through all surgery, so that training logic (progression, 1RM, recovery, imports) is provably untouched where it should be.

## Implementation Decisions

- **Single mode**: the store boots directly into guest mode. The demo seeding flag, demo reset action, `/api/config` fetching, guest-allowed gating, sign-out/sign-out-everywhere, server pull/push and dirty-flag logic are removed from the store. Guest mode stops being a fallback and becomes the whole product.
- **Storage module** (new): one module in the frontend lib layer owns persistence. It loads on boot and saves debounced after each state change, writing to both localStorage and IndexedDB; boot compares timestamps and keeps the newer copy. This generalizes the pattern already used for the Capacitor file mirror, minus the native shell.
- **Backup nag** (new): Settings-level reminder driven off the timestamp of the last successful export; surfaces a gentle prompt when the threshold passes.
- **Theme defaults**: default state flips to light theme with a green accent; accent picker, dark toggle and per-profile persistence untouched otherwise.
- **Branding**: display name, PWA manifest name/short_name, page title, About content become "Sky". Existing icons retained initially.
- **Deletion scope**: `api/`, `web/`, `mcp/`, `docker-compose.yml`, `.gitlab-ci.yml`, `.gitea/`, GitHub docker/pages workflows, passkey/WebAuthn helpers, push notification code paths, admin UI. The Pages-shaped CI knowledge moves into a future deploy step when hosting is chosen.
- **Locales**: strip all locales except English; i18n machinery reduced accordingly.
- **Copy rewrite**: upstream links (GitLab project, Discord, Buy Me A Coffee, self-hosting docs, demo notices) rewritten for Sky; AGPL license notice retained in About.
- **License compliance**: modifications to AGPL code stay AGPL; attribution preserved.
- **Version control first**: `git init`, pristine baseline commit of unmodified v1.2.9 sources, then each work stream as its own commits. No remote yet.
- **Hosting deferred**: build output must remain host-agnostic (relative base); actual deploy target decided later.

## Testing Decisions

- Good tests assert external behavior through narrow seams, not internals; this repo's established pattern is pure decision functions tested via injected harnesses (see the Android back-button tests) and happy-dom component tests with mocked stores (see the Stats recovery tests).
- **Seam 1 (new, the only new seam)**: the storage module's two pure decisions — which copy wins at boot (newest timestamp; empty defaults otherwise) and whether the backup reminder is due — tested with plain in-memory fakes; the thin IO shell around them stays untested.
- **Seam 2 (existing pattern)**: one boot-flow smoke test mounting the app in happy-dom asserting no login screen, no seeded demo data, main UI present.
- The full existing Vitest suite must pass unchanged after surgery (`npm test` in `frontend/`); production build success is part of verification.

## Out of Scope

- Any server, backend, database, or cross-device sync.
- Hosting/deployment execution (GitHub Pages / Netlify / Vercel choice happens when the user is ready).
- New training features beyond upstream v1.2.9 (roadmap items like 5/3/1 programming, body measurements, plate calculator).
- Custom logo/app-icon design (placeholder swap optional, later).
- Android/Capacitor standalone build (iOS PWA is the target).
- Merging upstream improvements (baseline is preserved to make it *possible*, not planned).

## Further Notes

- Exercise media (~140 MB) streams from the jsDelivr-pinned dataset CDN at runtime, exactly as upstream's own static demo does; workouts work offline, animations need connectivity.
- Do not log real history against a LAN dev-server URL from the iPhone: the origin is tied to the PC's IP and data would be stranded if it changes. Desktop testing now; hosted origin later.
- The static-build capability already exists upstream (`VITE_DEMO=1`) and is being promoted, not invented; the demo seed generator and its gating are what get removed.
