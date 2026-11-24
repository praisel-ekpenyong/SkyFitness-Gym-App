# The Draft guard (Data integrity)

The detail behind "Data integrity and persistence" in
[`CODING_STANDARDS.md`](../CODING_STANDARDS.md).

Sky has no SQL database or server-side drafts. In Sky, the "Draft guard" is the
set of architectural invariants that protect **historical immutability**, prevent
**stranded writes** on in-progress workouts, and guard the **schema admission
boundary**.

## 1. History is immutable: The Training Log is the only reading

Completed workouts in `S.workouts` are an append-only historical log
([ADR 0031](./adr/0031-the-training-log-is-the-only-reading.md)).

- **Never rewrite a completed workout.** Finished sessions are immutable.
  Estimated 1RM, best records, tonnage, and progression history are derived by
  reading the log forward, not by mutating past records
  ([ADR 0020](./adr/0020-working-weight-is-read-from-the-log.md), as amended;
  ADR 0031 replaced ADR 0021).
- **Unit switches never convert history in place.** When a lifter switches
  units (`kg` ↔ `lb`), past workouts retain their logged unit and are read in
  that unit ([ADR 0031](./adr/0031-the-training-log-is-the-only-reading.md), which
  replaced ADR 0028). Unit switching
  is strictly refused while a workout is active.
- **A finished Workout is not rewritten.** Custom exercises copy the muscles
  the lifter picked into `muscleSnapshot` at finish (`active-finish.js`), so a
  later edit or delete of that custom exercise does not change the session.
  The frozen name is `muscleSnapshot.n`.
- **A built-in exercise has no `muscleSnapshot`.** Catalogue corrections
  re-attribute past sessions on purpose, with no migration
  ([ADR 0025](./adr/0025-movement-pattern-corrections.md)).

## 2. Active workout target freezing: Stopping stranded writes

A **stranded write** occurs when an edit to a plan, routine, or catalogue item
mutates or corrupts a session that is already in flight.

- **`act(S, { type: 'begin', routineId, bw })` freezes a deep copy.** Each
  Routine exercise is copied into `active.entries[].target`. The Entry's
  `target` is not the Routine's object
  ([ADR 0032](./adr/0032-the-active-workout.md)).
- **Routine edits do not reach live workouts.** If a lifter edits sets, reps, or
  exercises in a Routine while a workout is active, the in-progress session keeps
  its frozen targets untouched. Deleting the custom exercise underneath an
  in-progress Entry does not either: the Entry keeps the `target` copied at
  begin.
- **Target freezing survives routine synchronization.** Routine sync
  ([ADR 0014](./adr/0014-routine-sync-from-active-session.md)) updates the
  parent routine from performed sets on session finish, but never mutates the
  workout in flight.

## 3. The `admit` pipeline: The single entrance for state

Every Profile entering the application — at boot, via multi-tab storage sync,
JSON backup restore, or CSV import — must pass through `admit` in
`frontend/src/lib/profile/admit.js`
([ADR 0027](./adr/0027-admit-is-the-single-way-a-profile-comes-in.md)).

- **Fills missing fields from `DEF` across all depths.** A new setting or
  collection introduced in a newer code version is filled automatically without
  overwriting existing user values.
- **Ordered schema migration (`UPGRADES`).** Upgrades step sequentially from the
  stored `schemaVersion` to the current `SCHEMA_VERSION`.
- **Refuses newer versions (`NewerProfileError`).** A Profile exported from a
  newer Sky build cannot be admitted into an older build; it is refused
  immediately without writing or partial corruption.
- **Sorts workouts into canonical log order.** Date first, then `start` time,
  then original order.

Never bypass `admit` by writing raw parsed JSON directly into `useStore` or
`localStorage`.

## 4. Dual-write persistence

State persistence is guarded by `platform/storage.js`
([ADR 0004](./adr/0004-dual-write-storage.md)):
- Every persist writes synchronously to `localStorage` (`gym_state_v1`) and
  queues a debounced write (800ms) to IndexedDB (`sky-state`).
- Mobile Capacitor builds additionally queue a debounced write to native storage
  (`platform/mobile.js`).
- `visibilitychange → hidden` immediately flushes all debounced writes so
  backgrounding the app never drops data. The listener is in `useStore.js`.

## Teeth

**Runs:**

- `lib/active-workout.test.js` — begin copies `target` and does not share the
  Routine's object; a finished custom exercise has `muscleSnapshot`; a built-in
  does not.
- `lib/profile/admit-defaults.test.js` — absent fields fill from `DEF`, and a
  stored value is kept.
- `lib/profile/upgrades.test.js` — a newer Profile throws `NewerProfileError`.
- `lib/profile/workouts.test.js` — `sortWorkouts` is date, then `start`, then
  original position. `admit` calls it.
- `platform/storage.test.js` — the IndexedDB mirror waits 800ms, and `flush()`
  drains it immediately.
- `lib/routines.test.js` — an edit to a Routine's exercise config while a
  workout is active leaves `S.active` deep-equal to the copy taken before:
  `actRoutine` runs with `S.active` set, and `entries[].target` does not move.
- `store/useStore.flush.test.jsx` — hiding the document calls `flush()`: the
  pending Profile reaches the mirror without waiting 800ms.
- `lib/active-workout.test.js` — a refused `act` command leaves the Profile
  unchanged and returns `effects: []`.
- `lib/profile/profile-keys.test.js` — every `DEF` key is cleaned, structural,
  or on a pass-through list with a reason (see "State ingestion goes through
  `admit`" in `CODING_STANDARDS.md`).

The guards here are tests, not lint: no linter sees an edit reach a live
workout.
