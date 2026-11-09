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
- As of 2026-11-09, `pkill -f <pattern>` kills the calling agent's own shell whenever the pattern appears
  anywhere in the command being run. Hit twice that day. Stop processes by port or exact PID.
- As of 2026-11-09, Playwright seeding must happen before the app's first load, or the app saves an empty
  profile first and the seed is skipped. Seen with a Chromium `--app=<url>` window.
- Two Vite dev servers must not share `node_modules/.vite`, so a worktree whose server runs beside another
  needs a real `npm install`, not the symlinked `node_modules` older worktrees used (observed 2026-11-09).
- On 2026-11-09, visual review tools were written for agents at `frontend/scripts/review/` (`review:*` npm
  scripts) with a project skill at `.claude/skills/run-sky/SKILL.md`. As of that date they are uncommitted in
  `.worktrees/ui-review-harness`, branched from `ui/iron@1ec0dc4`, pending the owner's decision. Ticket:
  `.scratch/ui-review-harness/issues/01-promote-review-harness.md`.
- On 2026-11-09, a second interactive session worked in the main checkout alongside the chief-of-staff session.
  It is the likely author of that day's uncommitted `PRODUCT.md` edit; authorship was not confirmed. Parallel
  sessions share one working tree there, so stage files by name.
- On 2026-11-09 the second session ran `impeccable`: its `product-schema` marker is in that day's `PRODUCT.md`
  edit, and at 17:50 its live mode injected `<script src="http://localhost:8400/live.js?token=…">` into
  `frontend/index.html` in the main checkout. As of `ui/iron@1ec0dc4` no test rejects a non-same-origin
  script in `index.html`, so the pre-commit hook would let that ship; the deploy CSP (`default-src 'self'`)
  would then block it.
- On 2026-11-09 at 17:52 an uncommitted prototype worktree and its branch and ticket were removed while a
  second session was active (see [UI directions](ui-directions.md)). Uncommitted worktree work has no
  recovery path in git; a WIP commit on the ticket branch would have survived a branch delete via reflog only
  until gc, and survived a worktree removal outright.
- Release pipeline verification includes 4 stages: unit tests (`npm test`), 108k fatigue probe (`npm run test:fatigue-probe`), bundle compilation (`npm run build`), and 6-screen Playwright navigation check (`npm run test:preview`). See [deployments](deployment.md).

## Deviations on record

- **2026-10-27 — the progression-runs ticket skipped the tracker.** The
  `ticket/progression-runs` work (merged `d6976cd`) was implemented without any
  `.scratch/progression-runs/` directory; its spec had to be reconstructed from
  the commit message and ADR 0011 during review. Convention reminder for future
  efforts: file the spec and tickets **before** implementation starts.

- **2026-11-09 — the Iron UI rebuild skipped the tracker.** `ui/iron@1ec0dc4` was built directly in the main
  checkout, with no `.scratch/` spec, tickets or worktree, against the convention above. The chief of staff
  noticed this after the fact. `.scratch/ui-prototype/` and `.scratch/ui-review-harness/`, filed the same
  day, follow the convention.

## Superseded

- (none yet)
