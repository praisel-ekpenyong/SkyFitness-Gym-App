# Iron launch

What remained of `.scratch/iron-launch/` on 2026-11-15, checked against `main@a924ee4`.
The tracker is the source; this page records that check.

## Merged, tracker not yet closed

On 2026-11-15 these were already ancestors of `main`, while the issue files still
said `ready-for-agent`. Closed the same day (see [process](process.md)):

| Ticket | Merge on `main` | Fix |
| --- | --- | --- |
| 01 Superset exit scroll | `679b62e` | `4e28cde` (2026-11-09) |
| 02 44px tap targets | `48149b3` | `1dc726d` (2026-11-10) |
| 03 Records are yellow | `9b2f669` | `2936417` (2026-11-09) |
| 04 Same-origin scripts | `052c3af` | `daf39e8` (2026-11-10) |

Ticket 05 (deploy) lists 01–04 as blockers. After that close it is unblocked.
It stays `ready-for-human`.

## Still open on 2026-11-15

- **08 Compact header on short screens.** No commit on `main`. The worktree
  `.worktrees/il-08-compact-short-screens` was at `b29adca` with nothing of its own.
  `frontend/src/styles/workout.css` had no height query for the short-screen header.
- **09 Accent picker.** The five-accent picker shipped in iron-discipline
  `33a29dc`. Stored gold, red and orange read as lime (`frontend/src/store/accent-normalize.test.jsx`
  at `a924ee4`). The ticket still says a saved gold profile keeps rendering gold.
  Left `ready-for-agent` because that acceptance was not what shipped.
- **10 Polish bundle.** At `a924ee4`, `fmtVol` in `frontend/src/lib/format.js` still
  joined a number and its unit with a plain space; the Discard key's accessible
  name in `frontend/src/views/Workout.jsx` was still `Discard`; `sizeOf` in
  `frontend/src/components/Barbell.jsx` still divided pounds by 2.25. The second
  greeting ("Welcome!") was already absent from `frontend/src`.
- **11 Landing screenshots.** `resolved` on `integration/iron-launch@3c6ce04`
  (screenshot commit `e89d090`). Not in `main`. `main` was one docs commit ahead
  (`a924ee4`). The implementer noted the 3x capture was a throwaway script, and
  that ticket 08 would force a re-shoot if it changes the 390×844 layouts.

## Owner, after the deploy

- **05** Deploy `main` to `skyfitness.pages.dev`. As of the 2026-11-14 note in
  [deployment](deployment.md), Cloudflare's production branch was still `master`,
  and a push of `main` to the `iron` branch only updated the preview.
- **06** Device check and log switch, on the owner's iPhone, after 05.
- **07** Archive `SkyFitness-Gym-App-master` after 6 workouts logged on Iron
  with no rollback.

## Frontier on the evening of 2026-11-15

`integration/iron-launch` was at `93f84d4` (`merge: main into integration/iron-launch`), which contains ticket 11 (`e89d090`) and the docs commit `a924ee4`. Tickets 08 and 10 were the unblocked `ready-for-agent` frontier. Ticket 09 was closed the same evening without a new commit. The owner asked which close was recommended; the 2026-11-11 decision stands (stored gold, red and orange read as lime). See [decisions](decisions.md).

`.worktrees/il-08-compact-short-screens` carried an uncommitted draft onto that base: a `max-height: 699px` query in `frontend/src/styles/workout.css` and a fold check in `frontend/scripts/review/audit.mjs`. The main checkout's large uncommitted tree was left untouched and is not the integration base.

Later the same evening, ticket 10 fast-forwarded onto `integration/iron-launch`. HEAD moved from `93f84d4` to `798791e` (`fix: keep a figure with its unit, and the month title, on one line`). The suite passed there: 89 files, 1291 tests. Ticket 08 was still open, so the branch and worktree for ticket 10 were left in place. The sentence above that lists 08 and 10 as the frontier is superseded for ticket 10 only.

Still later, ticket 08 fast-forwarded onto the same branch. HEAD moved from `798791e` to `6327bd6` (fix `73980d0`, then the merge commit). The suite passed there: 89 files, 1291 tests. That was the last `ready-for-agent` ticket on the spec. Tickets 06 and 07 stayed `ready-for-human`.

The same evening the owner rejected the visual result. `447b207` on `integration/iron-launch` reverted `798791e` and `73980d0`. Both tickets were set back to `needs-info`. The suite at that revert passed: 88 files, 1290 tests.

On 2026-11-15 the owner passed ticket 06 on an iPhone 13 Pro Max and said everything works. The six-workout count for ticket 07 starts that date.

Later the same day the owner said the six workouts were done. `SkyFitness-Gym-App-master` `master` moved to `94eb0f8` and was tagged `archive/pre-iron`. Branches `ui/iron`, `ticket/01-ui-review-harness`, and `ticket/unify-progression-milestones`, and their worktrees, were removed. The Netlify site was not redeployed. The Fallback icon was left on the phone.

## Related

- [Process notes](process.md)
- [Deployments and hosting](deployment.md)
- [Decision log](decisions.md) — 2026-11-11 iron-discipline D1, which overtook ticket 09's keep-rendering clause.
