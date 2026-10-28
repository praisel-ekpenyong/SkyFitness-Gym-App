# Decision log

One entry per decision, newest first. A decision here is a settled call; the
ticket/ADR it points to carries the reasoning. Superseded entries stay listed
with a pointer to their successor.

- **2026-10-28 — Code comments adhere to Ousterhout's 'stranger' standard with automated comment-only verification.**
  Audited core domain and view files (`Workout.jsx`, `workout-model.js`, `format.js`, `bodyweight.js`, `schedule.js`, `progression.js`). Resolved all stale `@param` references (`STALE_PARAM` count reduced to 0), added missing top-level module overview docstrings describing subsystem ownership and boundaries, and documented public interface contracts (`inStream`, `timeAim`, `timeHit`, `replaceActiveExerciseFlow`). All comment additions and cleanups are strictly verified via AST comparison (`comment_tools.py verify`) to ensure zero runtime alterations. Merged in `a56e916` (ticket 01 in `.scratch/code-comments/`).

- **2026-10-28 — In-session exercise reordering is strictly session-local, non-destructive, and adheres to positional supersets.**
  Added `moveActiveExercise(S, idx, dir)` behind the ADR 0006 lifecycle seam in `lib/active-session.js` and exposed on `useStore`. Reordering operates on individual entries, is enabled when 2 or more exercises exist and no timed hold is active, keeps performed sets intact, tracks `active.cur` to the moved exercise, and dissolves supersets via `cleanupSg` if an entry is moved past outside neighbors. UI provides a dedicated sheet with Move Up/Down chevrons, close button, and tap/keyboard jump navigation. Merged in `669a6bd` and `6adf5a6` (tickets 01 and 02 in `.scratch/exercise-reordering/`).

- **2026-10-28 — Catalogue curations re-target RDL and SLDL to Hamstrings primary with secondary Glutes.**
  Preserved the single-primary invariant (`1.0` primary, `0.4` secondary). Unified catalogue overrides into a declarative `CATALOGUE_CURATIONS` seam in `frontend/src/lib/exercises.js` (folding in `SECONDARY_ADDITIONS`) without mutating `exercises-data.js`. Re-targeted Romanian Deadlifts, Stiff-Leg Deadlifts, Single-Leg Deadlifts, and Stiff-Leg Good Mornings to Primary Hamstrings (`1.0`), explicitly injecting Glutes into secondary additions alongside Lower Back (`0.4` each). Past workouts live-reinterpret through `EXIDX` per ADR 0009 without database migration. Specified in `.scratch/hamstring-set-distribution/` and ADR 0012.

- **2026-10-28 — Inter-exercise rest is bounded by the session finale and preserves unprompted view position.**
  Completing the final set of an exercise or superset unit starts rest at `S.restSec` only when another exercise remains in the session (`isLastUnit === false`). On the workout finale (`isLastUnit === true`), rest stops and auto-rest is suppressed so the workout complete sheet presents cleanly. Eager navigation on superset unit completion was removed, ensuring unprompted exercises and supersets keep their card position with the rest countdown running until the lifter navigates manually. Merged `9eeb0fe` (tickets 01 and 02 in `.scratch/rest-between-exercises/`).

- **2026-10-28 — In-session exercise replacement is strictly session-local, preserving supersets and order.**
  Added `replaceActiveExercise` behind the ADR 0006 lifecycle seam and wired into both
  `RoutineEdit` (template editing) and `Workout` (active session). In an Active workout,
  the replacement leaves the underlying Routine untouched, warns before discarding performed sets,
  stops any running hold timer, and seeds fresh rows from the replacement's own history.
  Merged `eb9d6d6` (tickets 01–03 in `.scratch/exercise-replacement/`).

- **2026-10-27 — Chief-of-staff wiki lives at `docs/wiki/`.** Chosen over
  `.wiki/` and top-level `wiki/` so it sits beside the other docs without
  disturbing the single-context tree in `docs/agents/domain.md`. (This page.)

- **2026-10-27 — exWeights seeding: keep the code, align the ADR.** The review
  found `buildSets` disables the `exWeights` hint for ALL routine-backed
  sessions while ADR 0011's text only specified it for a new stream's first
  session. Decision: the code is right (same-Routine history beats generic
  hints); ADR 0011's seeding bullet was rewritten to state the actual rule
  (merged `6e2346f`, ticket 01 in `.scratch/progression-review/`).

- **2026-10-27 — A change of working value starts a new Run, linear included.**
  Adopted the recommendation for ticket 05: Deload, up, or the lifter's hand
  each start a new Run (baseline never a Stall), unifying linear with double
  and add-time. Merged `218877a` (4 new test scenarios; virgin stretches
  untouched). Motivation: it is what ADR 0011 and `GLOSSARY.md` already define,
  and a hand-set weight must not pile an automatic Deload on top — the cascade
  shape ADR 0011 was written to kill.

- **2026-10-27 — Deload threshold double 3 → 4 stands.** Review flagged the
  stricter count as beyond the commit message's intent, but ADR 0011 authored
  it and the code matches the ADR. Declined, recorded in
  `.scratch/progression-review/spec.md`.

- **2026-10-27 — Review follow-ups action as tickets, not ad-hoc edits.** The
  two-axis review's actionable findings became tickets 01–04 in
  `.scratch/progression-review/`, each implemented in its own worktree branch
  and merged one at a time (see [process](process.md)).
