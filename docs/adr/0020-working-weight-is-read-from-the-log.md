# Working weight is read from the log

Status: Accepted. Amended by [0031](0031-the-training-log-is-the-only-reading.md) (Best is read from the Training log) and [0032](0032-the-active-workout.md) (the "Next" key reads `sessionView`; `nextUnitTarget` is gone).

## Context

ADR 0006 named "confirming working weight" as part of the Active workout lifecycle seam. After the last Work set
of a loaded reps Entry, `toggleActiveSet` returned `open-topweight` and a sheet asked the lifter to confirm a weight
the log already held. It pre-filled `max(heaviest Set today, previous best)`, so on a lighter day it offered a weight
that was not lifted, and stored it as `entry.topW`. Its copy said the highest "becomes the default next time"; on a
Routine the Prescription sets the next Target, so the promise was false. Its "Save and next exercise" key was also
the only automatic move to the next exercise, and only loaded Entries had it (design review 2026-11-13, R1).

## Decision

1. No sheet opens between Entries, in any Active workout, Freestyle included. The heaviest performed Work set is
   recorded silently by the finish merge (`completeActiveSession` → `heaviestForEntry` → `mergeExWeight`), as it
   already was.
2. When every Work set of the open Entry, or of its superset, is performed and another Entry follows, the set ladder
   ends in one key, "Next: <exercise>", naming the first Entry of the next Entry or superset. It reads the same for
   every Mode, nothing advances by itself, and it goes away when a Set is unchecked. The domain answers when it shows
   and where it leads (`nextUnitTarget` in `lib/active-toggle.js`); the view only renders it.
3. On the last Entry or superset the workout complete sheet opens directly (`open-finish`).
4. New Workouts stop writing `topW`. `peekWeightCommit`, `commitWorkingWeight`, `applyWorkingWeight`, the
   `open-topweight` and `topweight-then-*` outcomes, the `asked` flag and the store actions
   `recordWorkingWeight` / `commitWorkingWeight` are gone.

## Consequences

- No session can claim a weight that was not lifted: every stored best comes from a performed Set.
- One fewer modal per Entry; bodyweight, timed, cardio and loaded Entries end the same way.
- `topW` is legacy and read-only. Workouts saved before this ADR keep it, and `heaviestForEntry` and
  `bestWeightForEntry` still read it, so their bests read as before. History stays immutable.

2026-11 amendment: the finish merge (`heaviestForEntry` → `mergeExWeight`) is removed, and `exWeights` is no longer written. See ADR 0021.
