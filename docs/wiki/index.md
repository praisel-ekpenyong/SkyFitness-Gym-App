# SkyFitness Chief of Staff Wiki

Initialized on 2026-11-24 at `praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb`. This directory records durable architectural, tooling, and coordination knowledge across sessions, using the domain vocabulary in [GLOSSARY.md](../../GLOSSARY.md) and citing primary issues, pull requests, commits, and [CODING_STANDARDS.md](../../CODING_STANDARDS.md).

## Domain & Data Semantics

- [Local Dates and Timezones](local-dates-and-timezones.md) — `parseDay`, `todayISO()`, and local-midnight CSV timestamp offset convention finalized on 2026-11-24 in PR #142 (`8de9fcb`, closing #132 and #133).

## Tooling & Guardrails

- [Docs Path Guardrail](docs-path-guardrail.md) — How [docs.test.js](../../frontend/src/docs.test.js) and [docs-paths.js](../../frontend/src/docs-paths.js) enforced markdown links and backticked paths across tracked `*.md` files as of `8de9fcb`.

## Workflow & Coordination

- [PR and Worktree Discipline](pr-and-worktree-discipline.md) — Worktree `node_modules` symlinking, disjoint-PR batching, and multi-agent branch-sync discipline recorded on 2026-11-24.
