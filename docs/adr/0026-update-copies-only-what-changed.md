# update copies only what changed

Status: Accepted, 2026-11-18. Implemented 2026-11-18 (`.scratch/architecture-review-2026-11/issues/04`).

## Context

`update(mut)` in `store/useStore.js` deep-copies the whole Profile before every change, and `save()` writes all of
it to localStorage. The Training log reads (`best`, `records`, `e1rmSeries`) cache in WeakMaps keyed by the
`workouts` array, so every change, even ticking one Set, gives them a new array and throws the caches away. Measured
on desktop Node on 2026-11-18 with synthetic history (6 exercises × 4 sets per Workout): 400 Workouts are 700 KB and
cost about 25 ms per tap in copy, serialise and cache rebuild; 1,000 Workouts are 1.8 MB and about 68 ms. A phone is
several times slower.

## Decision

1. `update(mut)` runs the mutator through immer's `produce`. Mutators keep their current form: they change the draft
   in place. Branches the mutator does not touch keep their identity, so a Set tap leaves `S.workouts` as the same
   array.
2. The `_ts` stamp is set inside `produce`. `save()` reads its argument and never writes to it.
3. immer's auto-freeze is on in tests and off in production, so code that changes state outside `update` fails the
   suite rather than corrupting a frozen object in a user's browser.

## Consequences

- Identity-keyed caches survive edits that do not touch their input.
- One runtime dependency (immer).
- Every write to the Profile must go through `update` or `act`. That was already the rule; the freeze in tests now
  enforces it.
- `save()` still serialises the whole Profile. Splitting storage by key is a separate decision, not taken here.
