# The Active workout is one module behind `act` and `sessionView`

Status: Accepted, 2026-11-19. Supersedes 0006 and 0023.

## Decision

`lib/active-workout.js` is the Active workout's interface. It exports two things: `act` changes the Active workout, and `sessionView` reads it.

The files behind it are internal: `active-act`, `active-session`, `active-sets`, `active-toggle`, `active-finish`, `session-view`, and the flow helpers `setProgressHighWater` and `supersetFlowStep` in `supersetFlow`. Tests import only `lib/active-workout.js`. Superset pairing (`pairAdjacent`, `unpairSuperset`, `cleanupSg`) and `supersetUnits` stay public in `lib/supersetFlow.js`, because Routines use them too. Routine sync is its own module, `lib/routine-sync.js` (ADR 0014).

### `act(S, command)`

`act` mutates the Profile draft and returns `{ ok, effects, result? }`. An unknown command type throws. The commands are:

- `begin`, `discard`, `finish`;
- `toggle`, `editSet`, `addSet`, `removeSet`, `addWarmup`;
- `addExercise`, `removeExercise`, `replaceExercise`, `moveExercise`, `note`, `pair`, `unpair`;
- `goTo(entry)`, `prev`, `next`, where Prev and Next move by Step;
- `startHold`, `completeHold`.

Commands never ask for confirmation. `begin` returns `ok: false` while an Active workout with a performed Set exists. `finish` returns `{ workout, prs, e1prs, routineSync }`: the Workout, its load and Estimated 1RM Records read from the Training log before it joins the log (ADR 0031), and the Routine sync diff. `addExercise` returns the new Entry.

Behind `act` the module owns:

- Target freezing: an Entry's `target` is a copy of the Routine's exercise config, `rest` and `notes` included. Editing the Routine mid-workout does not change the Active workout.
- The Prescription: `nextPrescription`, `buildSets` and `applyPrescription`.
- Set toggles, superset flow and holds.
- Building the finished Workout and placing it in the log's Workout order (ADR 0027).

The Active workout carries the Profile's unit as `active.unit` (ADR 0031).

### `sessionView(active)`

`sessionView` is the one read model. It returns:

- the Steps, the current Entry and Step, and `nextStep`. `nextStep` is set only once the current Step is done, and it is where the "Next" key leads (ADR 0020);
- done and total per Step and per Entry;
- Session progress, counting Work sets only (ADR 0007), with the remaining count;
- whether Prev and Next are enabled;
- `hasPerformed` for each Entry;
- `finishGate`: `empty`, `warmups-only`, `early` or `complete`.

A sheet decides whether to warn "your logged sets will be lost" from `hasPerformed`, and chooses the finish wording from `finishGate`. Views render from `sessionView` and send commands. They hold no session rules.

### Effects

The module stays pure over the Profile. Timers, sound, notices and the finish sheet come back as effects: `rest:start`, `rest:stop`, `hold:start`, `hold:stop`, `sound:set`, `sound:finish`, `notice` and `open-finish`.

- `runEffects` in `store/effects.js` applies them to `useUI`, sound and toasts. It is the only store code that touches `useUI`. It reads `S.restSec` and `S.sound` itself; the timers read `sound` on every tick.
- A `rest:start` carries `sec` when an Entry of the Step has its own Rest duration (ADR 0029). Then the rest is the longest Rest duration in the Step, where an Entry on Default counts as `S.restSec`. That is the only place `act` reads `S.restSec`. Without `sec`, the runner rests for `S.restSec`. A Manual rest does not go through `act`: the Workout view starts it for `S.restSec`.
- The store exposes one `act(command, send)` in place of one method per command. It runs the command inside `update`, hands the effects to the runner, and returns the result.
- `open-finish` is left to the caller, because the store cannot import the sheets without an import cycle. `views/Workout.jsx` sends through its own `send`, which opens the workout complete sheet.

### Holds

`startHold` returns an opaque ref inside its `hold:start` effect. When the time is up, the timer sends `completeHold(ref, elapsed)` back through the same `send`; the runner throws if a hold starts without one.

`moveExercise`, `removeExercise` and `replaceExercise` bump a `layout` counter on the Active workout and emit `hold:stop`. A ref carries the `layout` it started under, so it is a no-op once the Entries have shifted or its Set is gone. A hold is cancelled, not carried to its Entry's new place, because an Entry has no identity of its own. The Workout view also disables those commands during a hold.

## Where the code differs from the earlier ADRs

The code wins; these are the facts on `main`.

- **The store's method is `act(command, send)`.** ADR 0023 wrote `act(command)`. The `send` argument is where a hold's `completeHold` goes, so its `open-finish` reaches the view.
- **The "Next" key reads `sessionView`.** ADR 0020 names `nextUnitTarget` in `lib/active-toggle.js` as the domain answer for that key. That function is gone; the key reads `nextStep`.
- **`finishGate` is a word, not counts.** ADR 0023 said it comes with the remaining counts. The counts are in Session progress (`progress.remaining`).
- **Finishing reads Records; it does not detect or remember them.** ADR 0006's `bestKnownWeight`, `mergeExWeight` and Record detection are gone (ADR 0031).

## Considered options

- **Named functions behind the barrel, with a thinner store wrapper.** Rejected: the interface stays as wide as before, and the store keeps one method per command.
- **Commands that return `needs-confirm`.** Rejected: that puts a UI round trip inside the module. A read-model flag gives the sheet the same fact.
- **The module owns timer state behind a timer adapter.** Rejected: there is only one adapter, so the seam would be hypothetical. The Active workout survives closing the app; the timers do not.
- **Merge the internal files into one.** Rejected: depth comes from the interface, not the file count.

## Consequences

- Cursor, Session progress, finish-gate, rest and hold rules are tested through `act` and `sessionView`, without React.
- Render tests keep only labels, aria, disabled state, and which command a click sends.
- A new Step-level rule touches one module.

## History

- **0006** (2026-08): the lifecycle as one seam in `lib/active-workout.js`, behind named store actions such as `beginSession` and `finishSession`. Its 2026-08 amendment moved every in-session mutation into the seam. ADR 0020 later removed working-weight confirmation from it, and ADR 0021 its Best and Record merge.
- **0023** (2026-11-16): one `act(command)` in place of 17 store methods, `sessionView` as the one read model, and effects in place of timer calls. Amended on 2026-11-16 (a hold is cancelled when Entries shift) and on 2026-11-18 by ADR 0029 (a `rest:start` may carry `sec`).
