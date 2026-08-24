Type: task
Status: resolved
Blocked by: 01

## Question

Execute the Sky rebrand that `.scratch/sky/issues/02-sky-branding.md` specifies (this ticket supersedes it; close that sky ticket with a pointer here when resolved, and likewise hand the branding slice of `.scratch/sky/issues/06-copy-and-license.md` over). The audit found the fork named "Sky" in AGENTS.md/.scratch while the running app still speaks openGym everywhere user-visible.

Scope, per the sky spec's branding decisions (display name, PWA manifest name/short_name, page title, About content become "Sky"; existing icons retained): user-visible strings (`Home.jsx:50` greeting fallback `'openGym'`, error copy like `t('this isn't an openGym plan file')`, plan-share printable footer), `index.html` title + manifest name/short_name, backup filename prefix (`opengym-backup-`, Settings.jsx:29), About/settings footer. Deliberately OUT of scope unless the answer argues otherwise: storage keys (`gym_state_v1`, `gym_user`, `gym_guest`) and the plan-file marker `opengym_plan` — renaming those breaks every existing profile and shared plan file for zero user-visible gain; they are wire-format identifiers, not language. Record what was changed, cite file:line, and confirm `npm test` stays green in `frontend/`. This is the map's one execution exception, per the owner's scoping call.

## Answer

Resolved. The full Sky rebrand is executed and verified across the codebase:

### User-Visible Surface & Metadata
1. **HTML & PWA Manifest**:
   - `frontend/index.html:6, 12`: `<title>Sky</title>`, `<meta name="apple-mobile-web-app-title" content="Sky">`, description updated.
   - `frontend/public/manifest.json:2-3`: `"name": "Sky"`, `"short_name": "Sky"`.
2. **Views & UI Strings**:
   - `frontend/src/views/Home.jsx:49`: Header `<h1>Sky</h1>`.
   - `frontend/src/views/Settings.jsx:29`: Backup export filename prefix `sky-backup-${todayISO()}.json`.
   - `frontend/src/views/Settings.jsx:47`: Backup import error copy (`not a Sky backup`).
   - `frontend/src/views/Settings.jsx:158`: Add to Home Screen tip (`to install Sky as a full-screen app.`).
   - `frontend/src/views/Settings.jsx:163-168`: About footer with correct AGPL §4–5 attribution (`Sky · free & open source (AGPL v3)`, fork notice linking to upstream openGym, MIT dataset and Gym Visual copyright).
3. **Plan Sharing & Printables**:
   - `frontend/src/sheets.jsx:643`: Plan export filename prefix `sky-plan-${todayISO()}.json`.
   - `frontend/src/lib/plan-share.js:77`: Invalid plan error copy (`this isn’t a Sky plan file`).
   - `frontend/src/lib/plan-share.js:254, 262`: Printable PDF plan kicker (`Sky`) and footer (`Made with Sky`).
4. **App Config & Packaging**:
   - `frontend/package.json:2`: Package name updated to `sky-frontend`.
   - `frontend/capacitor.config.json:2-3`: `appId: "com.sky.workout"`, `appName: "Sky"`.
5. **Preserved Wire Formats (Intentionally Out of Scope)**:
   - Storage keys (`gym_state_v1`, `gym_user`, `gym_guest`) and plan wire format key (`opengym_plan`) preserved to ensure backwards-compatibility with existing device storage and imported plan files.

### Verification
- `npm test`: All 28 test files and 356 tests pass cleanly.
- `npm run build`: Production bundle builds with 0 errors in under 1 second.
