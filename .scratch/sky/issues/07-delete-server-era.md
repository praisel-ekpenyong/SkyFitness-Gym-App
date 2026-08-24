# 07 — Delete server-era artifacts

**What to build:** A repo that contains only what runs. The Node API service, the nginx web container, the MCP server, Docker Compose file, GitLab/Gitea CI configs and the GitHub Docker/Pages workflows are all removed. Nothing in the remaining frontend depends on any deleted artifact. Purely mechanical; recoverable from git history.

**Blocked by:** 01 — Git baseline.

**Status:** ready-for-agent

- [x] Server/API directory, nginx web container directory and MCP server directory deleted
- [x] Docker Compose file, GitLab CI config, Gitea config and GitHub Docker/Pages workflow files deleted
- [x] Frontend builds and tests pass with the deletions in place
- [x] README-level references to deleted components left untouched here (handled by the copy ticket)

## Comments

**2026-08-24 — implemented.** `Status:` left as-is per house convention.

- **Deleted** (27 files, −6,181 lines): `api/` (Node service: server.js + Dockerfile + manifests), `web/` (nginx container), `mcp/` (server + tests), `docker-compose.yml`, `.gitlab-ci.yml`, `.gitea/` (workflows + issue templates), `.github/workflows/docker-publish.yml`, `.github/workflows/pages.yml`. Also `.dockerignore` and `.env.example` — both existed solely to build/configure the compose stack (`docker compose up`, RP_ID/passkey/admin/push vars); nothing else consumed them.
- **Deliberately kept**: root `website/` (marketing pages — upstream-facing copy is ticket 06's remit), `assets/` banners/screenshots (README material), root `scripts/` (build-instructions/fetch-media feed the frontend's exercise catalogue), `.github/FUNDING.yml`, issue templates. README/CONTRIBUTING/SECURITY/docs references to the removed stack were left untouched as instructed.
- **Surviving configs trimmed of dead references**: `.github/workflows/test.yml` lost its `mcp` job and `'mcp/**'` path filters; `.github/dependabot.yml` lost the `/api` npm watcher and both `/api`+`/web` Docker watchers; `renovate.json` was cut down to frontend-only (`enabledManagers: ["npm"]`, api/web-docker/gitlabci rules dropped) with a historical note that it fired only via the deleted `.gitlab-ci.yml` job.
- **Spec-scope push code paths**: the service worker's dead `push`/`notificationclick` handlers were removed from `frontend/public/sw.js` (ticket 06 had deferred them here); rest-timer reminders already go through `reg.showNotification()` directly. The now-dead `/api/` cache guard in the SW fetch handler went too.
- **Known remaining prose references to deleted artifacts** (all README/docs-level, owned by ticket 06's copy remit): CONTRIBUTING.md, docs/architecture.md, docs/SELF_HOSTING.md, `.github` issue templates' docker-compose mentions, and one stale mcp claim in a `frontend/src/lib/history.js` comment that this ticket did fix.
- **Verification**: full Vitest suite 322/322 across 21 files (unchanged from pre-deletion); `vite build` succeeds; renovate.json re-validated as JSON. Frontend had zero imports into the deleted directories.
