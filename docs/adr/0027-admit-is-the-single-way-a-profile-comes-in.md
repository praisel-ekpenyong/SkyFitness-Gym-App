# admit is the single way a Profile comes in

Status: Accepted, 2026-11-18. Not yet implemented (`.scratch/architecture-review-2026-11/issues/05`). Extends the
2026-11-15 reshape decision that picked `admit` as the base.

## Context

A Profile enters Sky four ways: boot, another tab's write, backup restore and CSV import. The rules for what a valid
Profile is are spread out. `DEF` and `normalizeState` live in `store/useStore.js`, so using them starts the store and
touches `document`. `RESTORE_TOP_KEYS` in `lib/storage.js` is a hand copy of `DEF`'s keys. Workouts are sorted by two
different rules (finish and CSV import) and not at all on restore, while progression reads them in array order.
Old data shapes (a `warmup: true` flag, a missing `phase`) are handled by readers across many files.

## Decision

1. `lib/profile/` holds `DEF`, `normalizeState`, `admit`, the restore keys (derived from `DEF`) and the one Workout
   order: date, then `start`, then original position. It needs no DOM and no store.
2. Every way in calls `admit`: boot, cross-tab sync, restore and CSV import. Finishing a Workout uses the same order.
3. `admit` upgrades old **shapes** only, for example `warmup: true` to `phase: 'warmup'`. It never rewrites
   **values**: units stay converted at read time (ADR 0019), and `topW` and `asked` stay as stored (ADR 0020).
   Reader branches made dead by an upgrade are removed.

## Consequences

- A new `DEF` key survives restore without a second list to update.
- Progression, History and Records can rely on Workout order.
- An old backup is upgraded on restore by the same code that upgrades it on boot.
- Profiles on disk change shape the first time they are saved after this ships; their values do not.
