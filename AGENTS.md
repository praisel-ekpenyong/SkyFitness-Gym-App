# Sky

A single-user, no-login, backend-free gym & body-weight tracker.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` — one directory per feature, one file per ticket. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Project shape

- `frontend/` — React 19 + Vite PWA. The entire app lives here.
- `frontend/src/lib/` — pure training logic (progression, 1RM, recovery) with Vitest tests next to the code. `npm test` in `frontend/`.
- Sky is a static build only — no server, no API, no backend.

## Git worktree discipline

- Implementer agents work inside their assigned worktree directory only — never the repo root or another ticket's worktree.
- Step 0 before any git write: `cd` to the worktree, then `git rev-parse --show-toplevel` must print the worktree path. Abort otherwise.
- Ticket branches are per-ticket; only the merger (or coordinator) touches the integration branch, one at a time.
