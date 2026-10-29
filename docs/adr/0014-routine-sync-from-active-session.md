# Routine sync from completed active session

## Context

In-session workout adjustments (exercise additions, removals, replacements, reorderings, superset links, and set count changes) have been strictly session-local. While this design protected routine templates from accidental mutation during training, it created substantial friction when lifters intentionally evolved their routines in the gym: adopting those changes permanently required remembering the modifications and manually re-entering them in the Routine editor.

## Decision

Introduce an opt-in **Routine sync** seam evaluated at session completion on the "Workout complete!" summary sheet (`FinishSummary`).

1. **Pure Projection Seam (`lib/routine-sync.js`)**: A pure domain module compares the completed session against the originating Routine (`routineId`). When differences exist, it produces a human-readable diff descriptor and projects a synchronized exercise array:
   - Preserves structural changes: added exercises, removed exercises, in-place replacements, reordered entries, and superset groupings (`sg`).
   - Updates target set count to match performed work sets (`doneWorkSets(entry).length`).
   - Retains planned target set counts (`target.sets`) for unperformed or skipped exercises (zero performed sets), preventing single-session skips from deleting exercises from permanent routines.
   - Preserves exercise configuration (`mode`, `reps`, `sec`, `min`, `speed`, `prog`) while intentionally omitting session loads/weights, allowing the progression engine and historical records (`exWeights`) to govern working weights.
2. **Review & Store Seam**: `FinishSummary` displays an opt-in toggle switch (default: OFF) with a compact change summary directly above the primary dismissal button ("Nice!"). Tapping "Nice!" commits the updated exercise array to `S.routines` via a single store action `syncRoutineFromSession(routineId, syncedEx)` and emits a confirmation toast. If dismissed with the toggle off, the routine remains untouched.
3. **Scope Bounds**: Freestyle sessions (`routineId == null`) and sessions with zero detected changes omit the toggle entirely.

## Consequences

- Routines can evolve organically through real gym usage without manual routine editor transcription.
- In-session safety is preserved during training: substitutions and reorderings remain local until explicit opt-in confirmation upon workout completion.
- Progression streams remain uncorrupted by raw session weights.
- All diff and projection logic is pure and verified test-first in Node unit tests, with view tests covering toggle interaction and store commitment.
