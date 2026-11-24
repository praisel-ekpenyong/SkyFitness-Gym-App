# Sky

A single-user, no-login, backend-free gym & body-weight tracker.

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `praisel-ekpenyong/SkyFitness-Gym-App` (public), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Project shape

- `frontend/` — React 19 + Vite PWA. The entire app lives here.
- `frontend/src/lib/` — pure training logic (progression, 1RM, recovery) with Vitest tests next to the code; owns no browser, UI, store or platform dependencies (enforced by `purity.test.js`). `npm test` in `frontend/`.
- `frontend/src/platform/` — platform adapters and browser edges (storage dual-write, sound, wakelock, back button, nav, mobile/Capacitor file backup, print dialog).
- Sky is a static build only — no server, no API, no backend.

## Git worktree discipline

- Implementer agents work inside their assigned worktree directory only — never the repo root or another ticket's worktree.
- Step 0 before any git write: `cd` to the worktree, then `git rev-parse --show-toplevel` must print the worktree path. Abort otherwise.
- Ticket branches are per-ticket; only the merger (or coordinator) touches the integration branch, one at a time.

## Setting up a worktree

- Create it at `.worktrees/<name>` on a branch `ticket/<name>`: `git worktree add .worktrees/<name> -b ticket/<name> main`.
- Link the dependencies: `ln -s "$(realpath <checkout>/frontend/node_modules)" frontend/node_modules`. Link to the real folder, never through another checkout's link. On 2026-11-18, checking out a commit from before PR #54 replaced the main checkout's ignored link with the old tracked one, and every worktree linked through it broke.
- Each worktree gets its own review port automatically (see the `run-sky` skill).

## GitHub and deploys

- GitHub `main` is the default branch and deploys production (skyfitness.pages.dev); merge by PR only, after the Tests check passes. Never push to it directly.
- Every other branch on GitHub builds only a Cloudflare preview. Open a PR's preview before merging it.
- Undo a bad deploy with a Cloudflare rollback, not a Git push. Cloudflare Pages project `skyfitness`, built by Cloudflare's Git integration (no `wrangler.toml`). Wrangler has no rollback command: roll back in the Cloudflare dashboard.
