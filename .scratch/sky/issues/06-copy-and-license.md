# 06 — Copy rewrite + license notice

**What to build:** Everything the user can read tells the truth about Sky. The About screen describes Sky as a personal fork of openGym and includes the AGPL license attribution. Mentions of self-hosting, GitLab project links, Discord, Buy Me A Coffee, demo notices and upstream feature text that no longer applies (login, sync, admin) are rewritten or removed. No functional changes.

**Blocked by:** 03 — Guest-only static boot (the old copy describes features this fork removes).

**Status:** ready-for-agent

- [x] About screen accurately describes Sky and its origin as an openGym fork
- [x] AGPL license notice present and readable in About
- [x] No user-visible references to login, accounts, server sync, admin dashboard or demo mode remain
- [x] Upstream promo links (GitLab, Discord, coffee fund) removed or replaced with Sky-appropriate text
- [x] Grep for upstream branding finds no stale user-facing strings outside license/attribution context

## Comments

**2026-08-24 — implemented.** Ticket 06's own edits are copy-only, no functional changes; the combined diff this ticket's app-surface work rode inside (fe6c424) additionally carries ticket 05's functional i18n changes (language picker removal, setLang simplification) — see that ticket. `Status:` left as-is per house convention.

- **About** (`views/Settings.jsx`): footer replaced with a Sky block — "Sky · free & open source (AGPL v3)", "a personal fork of" openGym linking the upstream GitLab repo purely as attribution/provenance, plus the exercise-data MIT note and the Gym visual © link. Tip copy now says "to install Sky as a full-screen app." Backup filename renamed to `sky-backup-<date>.json`; restore-side error reworded to "not a Sky backup" (old openGym backups still accepted — same shape).
- **Plan sharing** (`lib/plan-share.js`, `sheets.jsx`): print kicker "Sky", footer "Made with Sky" (upstream site URL dropped), share-file error "this isn’t a Sky plan file", sheet export renamed to `sky-plan-<date>.json`, intro copy says recipients import into their own Sky. Wire-format marker `opengym_plan` unchanged on purpose (ticket 07 owns wire compatibility).
- **ErrorBoundary**: console tag "Sky render error:", button "Reload Sky".
- **README**: rewritten end to end for a backend-free single-user fork — static quick start (`npm run dev` / `npm run build`), features pruned of login/passkeys/admin/push/12-languages/MCP/APK download, storage-durability and English-only bullets added, "How it works" describes the single React app, new **Provenance** section replaces Community/Contributing, License opening states Sky inherits GNU AGPL v3 from upstream while the third-party media paragraphs (ExerciseDB MIT metadata; disputed Gym visual media; NOTICE.md pointer) are preserved verbatim.
- **Note on landing**: the frontend copy edits above were sitting in the working tree when ticket 05 was committed, so they rode along inside fe6c424 (its message flags the interleave); this ticket's own commit carries the README rewrite.
- **Allowed residues**: wire-format ids (`opengym_plan`, `openGymSheet` pushState token, `opengym-state.json` native mirror), attribution contexts (About footer, README License/Provenance), NOTICE.md/CHANGELOG.md history, internal dev comments, and the dead service-worker push handler whose strings await ticket 03/07 cleanup.
- **Residue found in review, then fixed**: the spec-axis reviewer caught `frontend/src/locales/*.js` (11 packs) and `frontend/src/instr/*` (9 packs) still on disk as dead code holding dozens of stale upstream strings ("Sign in with passkey", "Admin dashboard", openGym mentions) — ticket 05 claimed their deletion but it hadn't landed. Verified nothing imports them (`i18n-core.js` keeps its dictionary empty by design; only the parity-check scripts referenced them), then deleted both directories plus `scripts/check-locales.mjs` and `scripts/check-source-strings.mjs`. Vitest 322/322, build clean after removal.
- **Verification**: full Vitest suite 322/322 across 21 files; production build clean.
