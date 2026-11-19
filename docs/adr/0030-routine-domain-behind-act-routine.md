# Routine domain behind `actRoutine` and `routineView`

Status: Accepted, 2026-11-18.

## Context

`S.routines` mutations were previously open-coded directly across presentation views and sheets (`views/RoutineEdit.jsx`, `views/Plan.jsx`, `sheets/catalogue.jsx`, and `sheets/session.jsx`). Because routine management was scattered across UI components, callers had to manually coordinate structural invariants:

1. **Schedule cascade leaks**: Deleting a routine required views to remember to call `detachRoutine(S, routineId)`. Omitting this left dangling routine IDs in `S.week` and `S.dayPlan`, corrupting the schedule.
2. **Superset invariant leaks**: Moving, deleting, or pairing exercises required callers to manually import and run `cleanupSg(routine.ex)`. Omitting this broke positional superset groupings.
3. **Obsolete cue leaks on replacement**: Substituting an exercise required manual note clearance to prevent old equipment cues and seat settings from carrying over to the replacement movement (ADR 0015).
4. **Ad-hoc session synchronization**: Adopting in-gym workout changes back into the originating routine bypassed routine planning semantics, relying on a bespoke store mutation (`syncRoutineFromSession`).

Ticket 12 had previously marked routine domain encapsulation as wontfix under the assumption that routines were simple array operations not warranting a dedicated domain module. Real gym usage proved this assumption invalid: routine mutations encompass schedule cascades, superset adjacency, target configuration defaulting, note clearance, and post-session synchronization.

## Decision

Introduce `frontend/src/lib/routines.js` as the deep domain module encapsulating all Routine lifecycle mutations and derived presentation properties behind two primary seams:

1. **`actRoutine(S, command)`**: The single pure command interface for mutating routine state on profile drafts. Supported commands:
   - `create`: Allocates a unique ID (`uid()`), localized default name (`t('New routine')`), default glyph (`DEFAULT_GLYPH`), and empty exercise collection. Appends to `S.routines` and returns `{ ok: true, result: routine }`.
   - `delete`: Removes the routine from `S.routines` and atomically detaches it from `S.week` and `S.dayPlan` via `detachRoutine(S, routineId)`. Returns `{ ok: true }`. Returns `{ ok: false }` for unrecognized routine IDs.
   - `rename`: Updates routine name.
   - `setGlyph`: Updates routine glyph/emoji.
   - `setProgression`: Updates routine-level progression scheme.
   - `addExercise`: Appends an exercise entry, seeding default target values via `defaultConfig(exId)` if not provided, and sanitizing notes via `cleanNote`.
   - `removeExercise`: Removes an entry at the specified index and normalizes supersets via `cleanupSg`.
   - `moveExercise`: Swaps entries at the specified index and direction, validating bounds, and normalizes supersets via `cleanupSg`.
   - `replaceExercise`: Substitutes the exercise at the specified index, clears obsolete notes (ADR 0015), preserves superset membership, sanitizes any replacement notes via `cleanNote`, and normalizes supersets via `cleanupSg`.
   - `toggleSuperset`: Inspects adjacency between `index` and `index + 1`, toggles pairing, and normalizes supersets via `cleanupSg`.
   - `updateExercise`: Updates exercise target parameters in-place at the specified index, sanitizing notes via `cleanNote`.
   - `syncFromSession`: Deep-clones the synchronized exercise array onto `routine.ex`, absorbing the previous `syncRoutineFromSession` action.
   - Precondition checks: Gracefully returns `{ ok: false }` for missing routines or invalid indices. Throws an error on unrecognized command types.

2. **`routineView(routine)`**: The companion read model projecting layout properties for presentation:
   - `steps`: Sequential exercise clusters derived via `supersetUnits(routine.ex)`.
   - `entries`: Enriched exercise entries providing `isLinkedPrev`, `isLinkedNext`, `inSuperset`, `isFirstInSuperset`, and `hasNote` flags.

3. **Store Integration**:
   - `useStore.js` exposes `actRoutine(command)` running `actRoutine(s, command)` inside `update(...)`.
   - The bespoke `syncRoutineFromSession` action is removed from `useStore.js`.

4. **Purity**:
   - `lib/routines.js` remains pure domain logic with zero imports of React, Zustand, Capacitor, or browser globals, verified by `purity.test.js`.

## Consequences

- **Atomic schedule cascades**: Routine deletion automatically cleans week and date overrides, eliminating dangling routine references.
- **Automatic superset integrity**: All entry additions, removals, reorderings, replacements, and pairings preserve valid superset groupings automatically without views coordinating `cleanupSg`.
- **Pure Node domain testability**: All routine invariants are verified test-first in fast Node unit tests (`lib/routines.test.js`) without DOM mounting.
- **Component simplification**: `RoutineEdit.jsx`, `Plan.jsx`, `catalogue.jsx`, and `session.jsx` dispatch high-level intent through `actRoutine` and render from `routineView`, eliminating scattered domain rules.
- **Supersedes ticket 12**: Formally reverses ticket 12's wontfix evaluation.
