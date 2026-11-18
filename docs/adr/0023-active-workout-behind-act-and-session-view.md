# The Active workout is one module behind `act` and `sessionView`

ADR 0006 named the Active workout lifecycle as one seam. By 2026-11 that seam had become shallow. `lib/active-workout.js` only re-exported five files. The store wrapped 17 of their functions in the same `let ok; update(s => ok = fn(s)); return ok`. `views/Workout.jsx` still did the session's own work:
- It rebuilt the cursor (`units`, `unitOf`, `unitIdx`, Prev/Next) beside `describeUnit` in `active-toggle.js`.
- It counted Session progress per Step in a second place, and the reorder sheet counted it in a third. `finishWorkout` in `sheets/session.jsx` also counted it, to choose between nothing logged, warm-ups only, finish early and complete.
- It finished a timed hold as two store writes plus a toggle. That is why `holdRef` and `findHoldRow` were exported.
- It had to remember to stop the hold and rest timers on begin, finish and discard. PR #26 added the missing `stopWork()` calls in three places.

As a result, about 95 render tests across 11 `Workout.*.test.jsx` files were checking domain rules through React.

## Decision

The Active workout is one module, `lib/active-workout.js`. Its interface has two parts:

- **`act(S, command)`** mutates the Profile draft and returns `{ ok, effects, result? }`. Commands:
  - `begin`, `discard`, `finish`
  - `toggle`, `editSet`, `addSet`, `removeSet`, `addWarmup`
  - `addExercise`, `removeExercise`, `replaceExercise`, `moveExercise`, `note`, `pair`, `unpair`
  - `goTo(entry)`, `prev`, `next`. Prev and Next move by Step.
  - `startHold`, `completeHold`

  Commands never ask for confirmation. `begin` returns `ok: false` when an Active workout with performed sets already exists. `result` carries `finish`'s Workout, Records and Routine sync diff, and `addExercise`'s Entry.
- **`sessionView(active)`** is the one read model. It returns:
  - the Steps, the current Step and the next Step
  - done/total per Step, Session progress, and whether Prev and Next are enabled
  - `hasPerformed` for each Entry
  - `finishGate`: `empty`, `warmups-only`, `early` or `complete`, with the remaining counts

The module stays pure over the Profile. Timers and sound are effects: `rest:start`, `rest:stop`, `hold:start`, `hold:stop`, `open-finish`, a notice, `sound:set` and `sound:finish`. One runner in `store/` applies them to `useUI` and sound, and reads `S.restSec` and `S.sound` itself (amended 2026-11-18 by ADR 0029: a `rest:start` may name its own `sec`, and `S.restSec` is the fallback). The runner is the only store code that imports `useUI`. The exception is `open-finish`: the store cannot import the sheets without an import cycle, so `store.act` returns it and the Workout view opens the sheet. The store exposes one `act(command)` in place of its 17 methods.

A hold is started with `startHold`, which returns an opaque ref inside the `hold:start` effect. The timer's callback only sends `completeHold(ref, elapsed)`. A ref is a no-op once its set is gone or the Entries have shifted: `moveExercise`, `removeExercise` and `replaceExercise` bump a `layout` counter on the Active workout and emit `hold:stop`, and the ref carries the `layout` it started under. A hold is cancelled, not carried to its Entry's new place, because an Entry has no identity of its own and the Workout view blocks those commands during a hold anyway (amended 2026-11-16). `holdRef` and `findHoldRow` become internals.

The views only render and send commands. A sheet decides whether to ask "your logged sets will be lost" from `hasPerformed`, and chooses the finish wording from `finishGate`.

`active-session`, `active-sets`, `active-toggle`, `active-finish` and the flow helpers in `supersetFlow` (`setProgressHighWater`, `supersetFlowStep`) stay as files, but they are internal. Tests import only `lib/active-workout.js`. Superset pairing and `supersetUnits` stay public in `supersetFlow`, because Routines use them too. `routine-sync` leaves the barrel and is its own module (ADR 0014).

## Considered options

- **Named functions behind the barrel, with a thinner store wrapper.** Rejected: the interface stays as wide as today, and the store keeps one method per command.
- **Commands that return `needs-confirm`.** Rejected: that puts a UI round-trip inside the module. A read-model flag gives the sheet the same fact.
- **The module owns timer state behind a timer adapter.** Rejected: there is only one adapter, so the seam would be hypothetical. The Active workout survives closing the app; the timers do not.
- **Merge the five files into one.** Rejected: depth comes from the interface, not the file count.

## Consequences

- Cursor, Session progress, finish-gate and hold rules are tested through `act` and `sessionView`, without React.
- Render tests keep only labels, aria, disabled state, and which command a click sends.
- Adding a Step-level rule touches one module.

Carries ADR 0006 forward and replaces its named store actions (`beginSession`, `finishSession`, …) with `act`. Keeps ADR 0007's rule that Session progress counts Work sets only, and ADR 0016/0018 on the Session boundary and the Milestone cue.
