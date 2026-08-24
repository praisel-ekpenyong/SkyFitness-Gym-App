Type: task
Status: open
Blocked by: 01

## Question

Execute the Sky rebrand that `.scratch/sky/issues/02-sky-branding.md` specifies (this ticket supersedes it; close that sky ticket with a pointer here when resolved, and likewise hand the branding slice of `.scratch/sky/issues/06-copy-and-license.md` over). The audit found the fork named "Sky" in AGENTS.md/.scratch while the running app still speaks openGym everywhere user-visible.

Scope, per the sky spec's branding decisions (display name, PWA manifest name/short_name, page title, About content become "Sky"; existing icons retained): user-visible strings (`Home.jsx:50` greeting fallback `'openGym'`, error copy like `t('this isn't an openGym plan file')`, plan-share printable footer), `index.html` title + manifest name/short_name, backup filename prefix (`opengym-backup-`, Settings.jsx:29), About/settings footer. Deliberately OUT of scope unless the answer argues otherwise: storage keys (`gym_state_v1`, `gym_user`, `gym_guest`) and the plan-file marker `opengym_plan` — renaming those breaks every existing profile and shared plan file for zero user-visible gain; they are wire-format identifiers, not language. Record what was changed, cite file:line, and confirm `npm test` stays green in `frontend/`. This is the map's one execution exception, per the owner's scoping call.
