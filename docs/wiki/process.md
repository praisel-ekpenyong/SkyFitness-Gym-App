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

- **2026-11-11 — a recorded design decision was not in the code.** The 2026-11-09 decision to drop the gold,
  orange and red accents from the picker ([decisions](decisions.md)) had not landed by `main@c566fff`, where the
  picker still offered all eight. Nothing tested it, so nothing failed. Since then, design rules come with a guard test
  (`.scratch/iron-discipline/spec.md` G1/G2) so that drift fails the pre-commit hook.

## Superseded

- (none yet)

- **2026-11-14 — first effort on a separate integration branch.** Earlier efforts merged tickets straight into
  `main`. design-review-fixes uses `integration/design-review-fixes` instead (the implement-spec flow). Its ticket
  branches are named `ticket/drf-NN-slug` so they don't collide with iron-discipline's `ticket/NN-slug`.
  On 2026-11-14 the merger works in `.worktrees/integration-drf` (on `integration/design-review-fixes`), never in the
  main checkout. Ticket 03 merged there as `ef1808a`, and its `DESIGN.md` doc note went in as `623b887`.
  Screenshots are copied to `frontend/.tmp/review/drf-NN/` in the main checkout so they survive worktree removal.

- **2026-11-14 — design-review-fixes 01–04 landed on `integration/design-review-fixes@bd1669e`.** The review-fix pass
  merged as `f0095b4`, and 1245 tests passed. Ticket worktrees and branches were removed; `.worktrees/integration-drf`
  is kept for tickets 05 and 06. Observed: `git branch -d` checks against the branch checked out where it runs, so
  in the main checkout (on `main`) it refuses ticket branches merged only into the integration branch. Run it from
  the integration worktree instead, never with `-D`.
- **2026-11-14 — a ticket mis-named a domain field.** Ticket 04 said `w.prs` stores "which exercises made a
  Record". In code (`lib/active-finish.js` at `c2cd2a2`) it is set when a Set beats the heaviest logged load. The
  implementer followed the ticket, and only the Spec review caught the gap (see [reviews](reviews.md)). Lesson for
  ticket writers: when a ticket names a stored field after a glossary term, check what the code that writes the
  field does.
- **2026-11-14 — design-review-fixes 01–04 fast-forwarded into `main` (`bd1669e`), wiki committed as `1cc54a3`.**
  All four release stages passed at `bd1669e`. The integration branch and its worktree were retired. Nothing was
  pushed. Next: iron-discipline/03 merges `main` into its branch (it overlaps 9 files), then design-review-fixes
  05 and 06 branch from `main`.
  - *Superseded 2026-11-15:* the "Next" sentence. Both landed on `main` before `a924ee4` (iron-discipline merge
    `47db66a`; design-review-fixes merge `b29adca`). See [Iron launch](iron-launch.md).

- **2026-11-15 — launch tickets 01–04 were merged and the tracker was not updated.** At `main@a924ee4` the files
  in `.scratch/iron-launch/issues/` still said `ready-for-agent` for 01 (`679b62e`), 02 (`48149b3`), 03 (`9b2f669`)
  and 04 (`052c3af`). The status pass that day set them to `resolved`. Ticket 11 was `resolved` on
  `integration/iron-launch@3c6ce04` and not yet in `main`. Worktrees `.worktrees/il-05-gates`,
  `il-08-compact-short-screens` and `il-cleanup` sat on `b29adca` with no commits of their own.

- **2026-11-15, evening — launch integration caught up with `main` before the remaining agent tickets.** `integration/iron-launch` moved from `3c6ce04` to `93f84d4` by merging `main` (`a924ee4`, docs only). Ticket 08's branch had no commits of its own; it was reset onto `93f84d4` and its uncommitted draft (short-screen header CSS and an audit fold check) was kept. Ticket 10 got a new worktree, `.worktrees/il-10-polish`. The main checkout stayed dirty and was not the base. See [Iron launch](iron-launch.md).
