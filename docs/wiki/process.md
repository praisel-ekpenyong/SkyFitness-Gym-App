# Process notes

How work actually flows in Sky, as observed — cites beat restatements; the
authoritative conventions are `docs/agents/issue-tracker.md`,
`docs/agents/triage-labels.md`, `docs/agents/domain.md`, and the worktree
discipline in `AGENTS.md`.

## The flow that works (observed 2026-10-27)

1. Review (or any discovery) produces findings → file tickets under
   `.scratch/<feature>/issues/NN-slug.md` with a triage `Status:`.
2. Each ready ticket gets an implementer agent in its own git worktree, on its
   own `ticket/NN-slug` branch. Step 0: `git rev-parse --show-toplevel` must
   print the worktree path.
3. The coordinator merges to the integration branch **one ticket at a time**,
   running the suite after each merge, then deletes the branch and worktree.
4. On merge, the ticket flips to `Status: resolved` with a merge note under
   `## Comments` (merge SHA + commit SHA + test result).

## Environmental facts agents should know

- `.scratch/` is **gitignored** (local-only tracker): ticket files are NOT in
  git history and NOT visible in fresh worktrees. Agents read them via absolute
  paths on the main checkout. Discovered 2026-10-27 while filing
  `progression-review` tickets.
- A pre-commit hook re-runs the full frontend suite before allowing a commit —
  observed on every 2026-10-27 implementer commit (808/808 through ticket 04,
  812/812 after ticket 05). The test gate is therefore enforced at commit time,
  not just by instruction.
- Test suite as of 2026-10-28 (commit `32f391f`): 64 files, 888 tests, `cd frontend && npm test`.
  Fresh worktrees need `npm install` before testing.
- Release pipeline verification includes 4 stages: unit tests (`npm test`), 108k fatigue probe (`npm run test:fatigue-probe`), bundle compilation (`npm run build`), and 6-screen Playwright navigation check (`npm run test:preview`). See [deployments](deployment.md).

## Deviations on record

- **2026-10-27 — the progression-runs ticket skipped the tracker.** The
  `ticket/progression-runs` work (merged `d6976cd`) was implemented without any
  `.scratch/progression-runs/` directory; its spec had to be reconstructed from
  the commit message and ADR 0011 during review. Convention reminder for future
  efforts: file the spec and tickets **before** implementation starts.

## Superseded

- (none yet)
