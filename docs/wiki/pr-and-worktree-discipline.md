# PR and Worktree Discipline

Related: [Wiki Index](index.md) · [Local Dates and Timezones](local-dates-and-timezones.md) · [Docs Path Guardrail](docs-path-guardrail.md) · [AGENTS.md](../../AGENTS.md)

## Worktree Setup and Dependency Linking

As recorded in [AGENTS.md](../../AGENTS.md) (verified at `praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb` on 2026-11-24):

- **Step 0 before any Git write:** `cd` into the assigned worktree and verify `git rev-parse --show-toplevel` prints that exact worktree directory; abort otherwise. Implementer agents work inside their assigned worktree only, leaving the integration branch (`main`) to a single merger/coordinator and merging only by PR after checks pass.
- **Link `node_modules` to the real directory, never through another checkout's symlink:** On 2026-11-18, checking out a pre-PR-#54 commit replaced the main checkout's ignored `frontend/node_modules` symlink with an old tracked link, breaking every worktree whose symlink pointed through it. Worktrees created at `.worktrees/<name>` therefore link `frontend/node_modules` directly via `realpath`:

```bash
git worktree add .worktrees/<name> -b ticket/<name> main
ln -s "$(realpath <checkout>/frontend/node_modules)" frontend/node_modules
```

## Disjoint PR Batching

On 2026-11-24, five bug fixes were partitioned across three independent PRs by subsystem and downstream dependency rather than bundled into one branch:

- **PR #142 (`ticket/local-date-fixes`, merged at `8de9fcb`):** Grouped #132 and #133 because both fixed UTC vs. local-date handling inside `frontend/src/lib/` (`lib/dates.js`, `lib/progression.js`, `lib/training-log.js`, `lib/import-csv.js`), unblocking local-date lint rules in #110 (see [Local Dates and Timezones](local-dates-and-timezones.md)).
- **PR #143 (`ticket/135-136`, merged at `ee746a3`):** Grouped #135 (`NumberField` render-time ref write in `frontend/src/components/ui.jsx`) and #136 (`ReorderExercisesSheet` fresh `[]` selector in `frontend/src/views/Workout.jsx`), clearing `ui.jsx` hits for #104 and the remaining selector hit for #114 without coupling UI/store changes to `lib/` date fixes.
- **PR #144 (`ticket/native-save-failures`, open on 2026-11-24):** Isolated #134 (`nativeSave` error propagation in `frontend/src/platform/mobile.js`) on its own branch so Capacitor native-mirror behavior could be reviewed, previewed, and rolled back independently.

As established on 2026-11-24 (consistent with [AGENTS.md](../../AGENTS.md) at `praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb`), keeping disjoint ticket groups in separate PRs keeps each Cloudflare Pages preview scoped to one subsystem, avoids blocking unrelated lint-ratchet tickets (#104, #110, #114) behind each other, and preserves clean one-PR Cloudflare rollbacks.

## Fetch and Inspect Before Pushing in Multi-Agent Workspaces

On 2026-11-24, concurrent updates on PR #143 (`ticket/135-136`) demonstrated why branches must be fetched and inspected before pushing or switching:

- After the initial fix commit `5593416` (`2026-11-24 19:11:29 +0100`), a local review commit `bcc8d89` (`2026-11-24 19:15:19 +0100`, parent `5593416`) updated [CODING_STANDARDS.md](../../CODING_STANDARDS.md) and the new PR #143 test files.
- Almost simultaneously (`2026-11-24 19:16:15 +0100`), GitHub's branch-update flow created merge commit `19d425f` (`Merge branch 'main' into ticket/135-136`, parents `5593416` and `8de9fcb`) directly on the remote branch, leaving `bcc8d89` and `19d425f` on diverged tips.
- PR #143 merged `19d425f` into `main` at `ee746a3`, while `a3e4008` later merged `19d425f` and `bcc8d89` together on `ticket/135-136`.

Practice established on 2026-11-24: always run `git fetch` and inspect `git status` and `git log --oneline --graph` against the remote tracking branch before pushing, merging, or switching branches whenever GitHub branch-update actions or multiple agents can write to the same branch.
