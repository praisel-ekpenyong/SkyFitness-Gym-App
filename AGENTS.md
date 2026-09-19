# Sky

A personal fork of [openGym](https://gitlab.com/DuarteSantos8/opengym) (AGPL-3.0): a single-user, no-login, backend-free gym & body-weight tracker.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` — one directory per feature, one file per ticket. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Project shape

- `frontend/` — React 19 + Vite PWA. This is the only part Sky keeps.
- `frontend/src/lib/` — pure training logic (progression, 1RM, recovery) with Vitest tests next to the code. `npm test` in `frontend/`.
- Server-side parts of upstream (`api/`, `web/`, `mcp/`, Docker/CI configs) have been removed; Sky is a static build only.
