# 07 — Delete server-era artifacts

**What to build:** A repo that contains only what runs. The Node API service, the nginx web container, the MCP server, Docker Compose file, GitLab/Gitea CI configs and the GitHub Docker/Pages workflows are all removed. Nothing in the remaining frontend depends on any deleted artifact. Purely mechanical; recoverable from git history.

**Blocked by:** 01 — Git baseline.

**Status:** ready-for-agent

- [ ] Server/API directory, nginx web container directory and MCP server directory deleted
- [ ] Docker Compose file, GitLab CI config, Gitea config and GitHub Docker/Pages workflow files deleted
- [ ] Frontend builds and tests pass with the deletions in place
- [ ] README-level references to deleted components left untouched here (handled by the copy ticket)
