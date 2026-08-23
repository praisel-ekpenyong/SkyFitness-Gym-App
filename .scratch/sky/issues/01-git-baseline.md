# 01 — Git baseline

**What to build:** The project becomes a git repository with a pristine upstream baseline. Commit 1 is exactly the unmodified upstream v1.2.9 sources as they exist on disk today (nothing added, nothing removed). Commit 2 adds only the new agent-config and tracker files (`AGENTS.md`, `docs/agents/*`, `.scratch/sky/*`). No remote configured; every later change becomes reviewable as a diff against upstream.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `git init` in the repo root
- [ ] A sensible `.gitignore` exists before commit 1 so `node_modules`-style artifacts can never be tracked (upstream ships one; extend only if needed)
- [ ] Commit 1 contains exactly the pristine upstream tree
- [ ] Commit 2 contains exactly the agent-config and tracker additions
- [ ] Working tree clean after both commits; no remote configured
