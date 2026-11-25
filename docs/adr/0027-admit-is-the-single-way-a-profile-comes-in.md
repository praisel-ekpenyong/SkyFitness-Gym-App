# admit is the single way a Profile comes in

Status: Accepted, 2026-11-18. Implemented 2026-11-18 in PR #40 (`.scratch/architecture-review-2026-11/issues/05`).
Amended 2026-11-18 with a schema version and nested defaults (below). Extends the 2026-11-15 reshape decision that
picked `admit` as the base.

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
   (CSV import is superseded by the 2026-11-25 amendment below.)
3. `admit` upgrades old **shapes** only, for example `warmup: true` to `phase: 'warmup'`. It never rewrites
   **values**: units stay converted at read time (ADR 0031), and `topW` and `asked` stay as stored (ADR 0020).
   Reader branches made dead by an upgrade are removed.

## Consequences

- A new `DEF` key survives restore without a second list to update.
- Progression, History and Records can rely on Workout order.
- An old backup is upgraded on restore by the same code that upgrades it on boot.
- Profiles on disk change shape the first time they are saved after this ships; their values do not.

## Amendment 2026-11-18: schema version and nested defaults

`.scratch/docs-review-2026-11/issues/09`. Upgrades used to sniff shapes on every load, nothing told an older Sky that
a Profile came from a newer one, and the `DEF` overlay was shallow, so a new field inside `reminder` would not reach
existing Profiles.

1. **The Profile carries `schemaVersion`.** `SCHEMA_VERSION` (`lib/profile/upgrades.js`) is the length of
   `UPGRADES`, the ordered steps: step `n` takes a version-`n` Profile to `n + 1`. Every Profile saved before this
   has no version and reads as **version 0**; the shape upgrades above (`showRir` → `effort`, `warmup: true` →
   `phase: 'warmup'`) are the 0 → 1 step, so `SCHEMA_VERSION` is 1. `admit` runs the steps from the stored version
   and stamps the current one. A step still changes shapes only, never values. `DEF` holds the current version, so
   a fresh Profile needs no upgrade.
2. **Nothing is overlaid on `DEF` before `admit`.** `normalizeState` and Restore hand `admit` the payload as stored,
   so a missing version is never hidden by `DEF`'s. Restore carries `showRir` as a legacy key, like `exWeights`,
   so a pre-effort backup reaches the 0 → 1 step and restores with `effort: 'rir'`, as it would at boot.
3. **`admit` fills absent fields from `DEF` at any depth.** A field the stored Profile lacks, at the top or inside a
   nested default such as `reminder`, takes `DEF`'s value. A stored value, null or falsy included, is never
   replaced; arrays are values, not defaults to merge into. Filling is not a step: it runs at every version, so a new
   nested default needs no version.
4. **A Profile from a newer Sky is never admitted.** A version above `SCHEMA_VERSION`, or one that is not a whole
   number of at least 0, makes `admit` throw `NewerProfileError`. Each way in decides what happens next:
   - **Restore:** `validateBackup` refuses the file before anything is cleaned or replaced, and Settings shows
     "Import failed: this backup is from a newer version of Sky. Update Sky, then import it again".
   - **Boot:** if localStorage holds a newer Profile, or the IndexedDB mirror or native file that boot picks does,
     the store is not loaded from it, sets `newerProfile`, and writes nothing (no seeding, no reminder sync, no
     mirror seed).
   - **Another tab:** a newer Profile written by another tab sets `newerProfile`, whatever its `_ts`. This tab keeps
     its state in memory but writes nothing more, so it cannot overwrite the newer Profile with an older shape.
   - While `newerProfile` is set, the app shows only a notice and a Reload button. The newer Profile stays on disk
     as it was.
   - CSV import builds new Workouts and passes them to `admit` without a version, so they are upgraded from 0 and
     never refused. _Superseded by the 2026-11-25 amendment below._

### Consequences of the amendment

- A Profile on disk gains `schemaVersion: 1` the first time it is saved after this ships; its values do not change.
- An older build reached through a Cloudflare rollback, or an old tab left open after an update, stops instead of
  writing an older shape over the Profile. The lifter reloads, and the newer Sky reads it again.
- A version is raised only for a shape change that needs a step. A new field, top-level or nested, needs only a
  default in `DEF`.

### Amendment 2026-11-25: CSV import orders Workouts with `sortWorkouts`

Issue #139 found `mergeImport` calling `admit({ workouts })` only to sort new Workouts. No Profile enters there:
the store's Profile is already admitted, and the parsed rows are freshly built Workouts already in the current
`phase` shape, so `admit` had no defaults, upgrade step or version check to do. It manufactured a throwaway
Profile to get canonical log order.

1. `mergeImport` (`lib/import-csv.js`) calls `sortWorkouts` directly on the fresh Workouts. This supersedes the
   CSV-import half of Decision 2 and the matching line in the 2026-11-18 amendment. Boot, cross-tab sync and
   restore still call `admit`, unchanged.
2. `admit` throws on a non-record payload instead of passing it through, so a bad blob fails at the boundary
   instead of masquerading as a Profile. `normalizeState` keeps its own `isRecord` guard, so a missing or corrupt
   `gym_state_v1` still yields a fresh Profile at every ingestion edge.
