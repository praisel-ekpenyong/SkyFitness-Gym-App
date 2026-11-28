# Architecture

How Sky works under the hood: the persisted data model, where it lives, and the algorithms that turn history into prescriptions. Vocabulary follows the root [GLOSSARY.md](../GLOSSARY.md). Decisions and their rationale live in [docs/adr/](adr/).

## The big picture

Sky is a single-page React 19 app with **no backend**. One zustand store (`frontend/src/store/useStore.js`) holds the entire app state as one serializable object `S`; every mutation goes through `update(mut)` (the Active workout's through `act(command)`, which wraps it), which runs the mutator on an immer draft (`produce`), stamps `_ts` inside it, and persists the result. Only the branches the mutator touches are copied: ticking a Set leaves `S.workouts` the same array, so the identity-keyed `best`/`records`/`e1rmSeries` caches survive (ADR 0026). `save()` serialises its argument and never writes to it. immer's auto-freeze is on in tests and off in production, so code that changes `S` outside `update` fails the suite. Views read from `S` and never talk to a server. `src/` has no import cycles outside tests (enforced by `import-cycles.test.js`); `useUI` does not import the store, and the effect runner passes it the sound setting. Pure training logic lives in `frontend/src/lib/` beside its Vitest tests (kept pure with no browser or UI edge; enforced by `purity.test.js`); platform adapters and browser bindings live in `frontend/src/platform/` (storage, mobile, sound, wakelock, back navigation, printing); UI lives in `views/` (pages), `sheets/` (one module per domain — `session`, `exercise-detail`, `add-to-routine`, `custom-exercise`, `exercise-picker`, `exercise-config`, `confirm`, `bodyweight`, `history`, `schedule`, `plan-tools`, `profile`, `import`, `routine`, `volume` — each imported directly by its callers; no hub, no late-binding setters), and `components/` (custom control set in `ui.jsx`, focus-trapped modal dialogs in `Modals.jsx`, chart/map/media primitives).

Navigation is a HashRouter over `/home /plan /plan/r/:id /workout /stats /history /library /settings`. There are no context providers: cross-cutting ephemeral state (sheet stack, toasts, rest/hold countdowns) lives in a second store, `store/useUI.js`.

## Catalogue browsing (`lib/catalogue-query.js`)

The Library page and ExercisePicker share one pure query module for catalogue reads. `queryCatalogue({ profile, scope, search, equipment })` owns the policy for combining the built-in catalogue with custom exercises, resolving canonical muscle filters, searching names and muscle metadata, applying Favorites or Chosen scope, deriving usage counts, and producing equipment facets. It returns enriched rows with the original exercise plus favorite, usage, primary-muscle, and match-attribution facts.

The callers keep presentation concerns local: pagination, chip state, empty-state copy, selection, and the Library's best-weight display remain in their respective views. The query accepts malformed or missing profile collections as empty, never mutates input, and intentionally uses a direct pass over the catalogue rather than introducing an index before the measured need exists. This keeps catalogue policy deep and reusable while preserving the existing UI behavior; muscle naming and aliases continue to follow [ADR 0008](adr/0008-canonical-muscle-filters-and-custom-exercise-muscles.md).

## Active workout (`lib/active-workout.js`)

The Active workout is one module with a two-part interface ([ADR 0032](adr/0032-the-active-workout.md)). `act(S, command)` is the only way to change it: `begin`, `discard`, `finish`, `toggle`, set edits, exercise and superset edits, `goTo`/`prev`/`next` by Step, and `startHold`/`completeHold`. It mutates the Profile draft and returns `{ ok, effects, result? }`; commands never ask for confirmation. `sessionView(active)` is the one read model: the Steps and cursor, done/total per Step, Session progress, Prev/Next enablement, `hasPerformed` per Entry and the `finishGate` (`empty`, `warmups-only`, `early`, `complete`). The files under `lib/active-*` are internal to this seam. Behind it the module owns target freezing, `nextPrescription`/`buildSets`/`applyPrescription`, superset flow, and building the completed Workout with the Records for the finish summary.

Timers, sound, notices and the finish sheet come back as effects (`rest:start`/`rest:stop`, `hold:start`/`hold:stop`, `sound:set`/`sound:finish`, a notice, `open-finish`). A `rest:start` carries `sec` when the Step's Entries set their own Rest duration; without it the runner rests for `restSec` ([ADR 0029](adr/0029-rest-duration-per-exercise.md)). The store exposes one `act(command, send)`: it runs the command inside `update` and hands the effects to the effect runner in `store/effects.js`, the only store code that touches `useUI`. `open-finish` is left to the caller, because the store cannot import the sheets without a cycle. `views/Workout.jsx` sends through its own `send`, which opens the finish sheet, and a hold's `completeHold` goes back through that sender; the runner throws if a hold starts without one. Views render from `sessionView` and send commands; they hold no session math.

## Stats selectors (`lib/stats-selectors.js`)

Every number the Stats view shows derives through one pure seam: `selectStatsOverview(S, opts)` returns the counts, body-weight log series, muscle balance, fatigue, retained-strength and effort aggregates, and `selectExerciseStats(S, id, opts)` returns one exercise's mode, top-set / estimated-1RM / effort curve. Both are snapshots over the profile plus an explicit `now` — the view owns the ticking clock — and read exercises through an injectable `{ lookup }` catalogue port whose production default layers custom exercises, the built-in index, and logged history. Only completed work sets count: warm-ups never enter load, fatigue, strength, 1RM, or effort. Muscle attribution prefers the entry's logged `muscleWeights` snapshot over the catalogue record (a re-derived catalogue entry must not rewrite what a past session trained), while identity lookups such as names and modes stay catalogue-first.

## Persisted data model (`gym_state_v1`)

The whole state is one JSON object under localStorage key **`gym_state_v1`**. Defaults come from `DEF` in `lib/profile/def.js`. Every way a Profile enters — boot, another tab's write, Restore and CSV import — goes through `admit` in `lib/profile/admit.js`, which runs the upgrade steps from the stored `schemaVersion`, fills every absent field from `DEF` at any depth (a new field inside `reminder` reaches existing Profiles; a stored value, null included, is never replaced), stamps the current version and puts Workouts in Training-log order; it never rewrites values.

`schemaVersion` is the Profile's shape version, `SCHEMA_VERSION` in `lib/profile/upgrades.js` (currently 1). A Profile without it was saved before versioning and reads as version 0. `UPGRADES` holds the steps in order: step `n` takes a version-`n` Profile to `n + 1`, and adding a step raises `SCHEMA_VERSION`. A Profile with a higher or unreadable version came from a newer Sky and is never admitted: `admit` throws `NewerProfileError`. At boot or from another tab, the store sets `newerProfile`, writes nothing more, and the app shows only a notice to reload; a Restore of such a backup fails with a message and changes nothing (ADR 0027).

Every persist stamps `_ts = Date.now()`. New ids are generated by `uid()` in `lib/format.js` (base36 time + random). Dates are local `YYYY-MM-DD` strings, with the day-key and calendar helpers (`todayISO`, `isoOf`, `fmtDate`, `weekKey`, `mondayOf`, `monthKey`, `workoutTimestamp`) in `lib/dates.js`; a Set's display text is `setLabel` in `lib/set-label.js`; timestamps are epoch milliseconds.

### Settings / preferences

| Field | Meaning |
|---|---|
| `unit` | `'kg' \| 'lb'`. A switch (`switchUnit` in `lib/units.js`) converts Routine `weight` and `inc` and `targetW` in place, stamps every Workout and Weigh-in that has no `unit` with the outgoing unit, and is refused while a workout is active. Logged numbers are never rewritten; they are read in `unit` from their stamp (ADR 0031). |
| `restSec` | Rest duration in seconds. An exercise without its own `rest` uses it, and so does a Manual rest (ADR 0029). |
| `sound`, `keepAwake`, `theme`, `accent`, `body`, `gifSize` | Preferences. `body` only affects how the muscle map is drawn. |
| `targetW` | Goal body weight (number or null), in `unit`. |
| `effort` | Which per-set effort scale is logged: `'none' \| 'rir' \| 'rpe'`. The 0 → 1 upgrade step in `lib/profile/upgrades.js` maps a legacy `showRir` flag onto `effort`, then drops the flag. `effortOf` in `lib/effort.js` reads only `effort`. |
| `reminder` | `{ on, time, tz }` — workout-day reminder. `tz` re-stamped from the device on every boot so travelling stays correct. |

### Collections

- `bodyweight: [{ d, w, t, unit? }]` — weigh-ins, sorted by date. `unit` is present once a unit switch has stamped the entry; without it `w` is in the Profile's `unit`. Read them through `weighIns(S)` in `lib/bodyweight.js`, which returns them in the Profile's unit.
- `routines: [{ id, name, emoji, prog?, ex: [ExCfg] }]` — the emoji-named field actually stores an icon key (`lib/glyphs.js` maps legacy emoji through). `prog` is the routine-default progression policy.
- `week: { dayNum: routineId }` — weekly schedule. Keys are JS `getDay()` numbers (**Sunday = 0**) even though the UI lists days Monday-first.
- `dayPlan: { iso: routineId | 'rest' | '' }` — per-date overrides. `'rest'` forces a rest day; `''` means "back to the weekly schedule". Resolution order in `effectiveRoutineId`: dayPlan override → weekday → week.
- `exWeights: { exerciseId: { w, d } }` — legacy, no longer written or read (ADR 0031). Old Profiles keep it untouched; Best is read from the Training log.
- `customEx: [{ id, n, bp, desc?, custom: true }]` — user-created exercises; registered into the in-memory catalogue index on every persist.
- `workouts: [...]` — completed workouts (below), always in Training-log order: date, then `start`, then original position (`sortWorkouts` in `lib/profile/workouts.js`).
- `active` — the in-progress workout, or null. `admit` upgrades its shapes too, but a Restore never copies it.

### Exercise config (`ExCfg`) — plan side

`{ id, sets, sg?, mode?, reps?, sec?, weight?, min?, speed?, bodyweight?, side?, repsMax?, prog?, inc?, repsMin?, rest?, notes? }`

`rest` is the exercise's own Rest duration in seconds; absent means the Profile's `restSec`, and anything but a positive number reads as absent (`ownRest` in `lib/workout-model.js`). Target freezing copies it into the Entry's `target`, and the plan file and Routine sync carry it ([ADR 0029](adr/0029-rest-duration-per-exercise.md)). `sg` is a superset group id: entries sharing an `sg` value must be adjacent (`cleanupSg` enforces; ids look like `sg-{a}-{b}[-n]`). `bodyweight` is set when the exercise disagrees with the catalogue's bodyweight flag. Config sheets follow "Default decides": a control that offers a Default choice stores any other pick, even one equal to the current default, and only Default stores nothing; a control with no Default choice (the bodyweight switch) stores only a difference from what it follows. That keeps shared plan files readable without losing a lifter's pick ([coding standards](../CODING_STANDARDS.md)). Which fields each Mode carries is stated once in `lib/workout-model.js` (`pickTargetFields`), and `exLine` in `lib/format.js` is the one description of a Target ([ADR 0007](adr/0007-row-construction-single-home.md)).

### Workout shape

Active workout: `{ id, d, start, routineId | null (freestyle), name, bw, unit, cur, entries: [Entry] }`.
Completed workout (`buildCompletedWorkout` in `lib/active-finish.js`, reached through `act` `finish`): adds `end`, drops empty entries, freezes per-entry `target`/`plan`, `notes` and `muscleSnapshot` for custom exercises only, plus `unit`. Records are not stored; they are read from the Training log (ADR 0031). Tonnage is not stored either.

Entry: `{ id, target: ExCfg, sets: [Set], plan?, topW?, asked?, n?, muscleSnapshot? }`
- `plan` — the resolved Prescription. Active Entries keep the full object (including `why`); finished Entries keep the decision fields `{ kind, weight?, reps?, sec?, sets? }` so later sessions can read the Run boundary (ADR 0011).
- `topW` — legacy confirmed working weight. Neither a finished Workout (ADR 0020) nor a CSV import writes it; Workouts saved or imported earlier keep theirs, and Best still reads it when present.
- `n` — frozen name for deleted custom exercises; `muscleSnapshot` — frozen muscle map of a custom exercise, so history survives its edit or deletion. Built-in exercises have none: catalogue corrections re-attribute past sessions on purpose (ADR 0025).

Set shape varies by logged mode (`modeForSet` in `lib/workout-sets.js` resolves explicit `phase`/`mode` → unit token → field presence):
- reps: `{ w, r, done, rir?/rpe? }`
- time: `{ sec, w, done }`
- cardio: `{ min, speed, done }`

Warm-up rows carry `phase: 'warmup'`; rows written before ADR 0027 may carry `warmup: true`, and `admit` upgrades them on the way into the Profile. `isWarmupRow` reads the phase only. Optional effort/weight fields are key-**deleted** when cleared, not set to null — cleared ≠ zero, and backups stay minimal. Row shape and fallback defaults (`20 min` / `8 km/h` / `45 sec` / `3×10`) live once in `lib/workout-model.js` as `ROW_DEFAULTS`/`SETS_DEFAULTS` behind `makeRow(mode,target,{prev,warmup})` — see [ADR 0007](adr/0007-row-construction-single-home.md); `buildSets`, `insertWarmupRow`, `Workout addSet` and the `applyPrescription` growth path all delegate there, and the superset `hasWork`/`setProgressHighWater` path counts work sets only (`!isWarmupRow`).

## Persistence protocol

Web build: every `persist()` writes `S` synchronously to `localStorage` (`gym_state_v1`) and mirrors it to IndexedDB (`sky-state` db, `state` store) via `platform/storage.js` on an 800 ms debounce (flushed immediately on `visibilitychange → hidden`). At boot, `pickNewest` compares timestamps (`_ts`) and loads whichever stored snapshot is newer through `admit`, falling back to empty defaults if neither exists. Settings displays a gentle backup reminder when `backupDue` detects that the last successful JSON export (`S.lastExport`) is older than 14 days.

Mobile (Capacitor) build additionally mirrors state to a native file (`sky-state.json` in `Directory.Data`, via `platform/mobile.js`):

1. Native writes are debounced 800 ms after each persist.
2. `visibilitychange → hidden` flushes the debounce immediately — backgrounding is often the last event before the OS kills the app.
3. At boot, whichever copy has the newer `_ts` wins; a file copy also beats an empty localStorage. First run after upgrading from a file-less version seeds the mirror.

Why the web mirror exists: iOS Safari can evict WebView localStorage under storage pressure, so dual-write ensures your training log survives even if localStorage is cleared — see [ADR 0004](adr/0004-dual-write-storage.md).

## Training logic

All pure functions over `S`; nothing writes back into finished workouts, so fixing a mistyped set immediately changes the next prescription.

### Effort (`lib/effort.js`)
The internal aggregate unit is RIR (it has a true zero = failure); RPE 8 ≡ RIR 2. A set logged on one scale is never rewritten. Hard set threshold: RIR ≤ `HARD_RIR` (3); averages below `MIN_RATED` (5 rated RIR) render as a dash rather than a misleading number.

### Estimated 1RM (`lib/onerm.js`)
Epley by default (Brzycki/Lombardi available), capped at `REP_CAP` (12) reps — estimates beyond that are refused rather than extrapolated. A real 1-rep set *is* the measurement. Warm-ups and legacy `topW` shortcuts are excluded; reps-mode work rows are authoritative.

### Progression (`lib/progression.js`)
Policy resolution: exercise override → routine default → mode default (`linear` for reps, off otherwise). History is read as a **Progression stream** (exercise, Mode, planned sets, top reps/seconds) and its current **Run** (sessions at one working value); the Run's first session is a baseline. Double progression climbs reps through `[repsMin, reps]` and counts a Stall only when a session after the baseline makes neither a top hit nor Rep progress, so four such sessions deload; add-time climbs from the weakest performed hold and deloads three no-progress sessions after the baseline from the achieved hold; linear counts Misses after the current Run's baseline (3) and Greyskull counts every Miss (1). A Deload cuts 10 %, snaps to the equipment or timer grid, never goes below one Increment, and starts a new Run; Greyskull deliberately resets again from the reduced load on a Miss. Double progression also drops: a performed first Work set below the range takes one Increment off the next session at once, on the same floor, and starts a new Run ([ADR 0033](adr/0033-double-progression-drops-below-the-range.md)). Every `up` instead adds the exact Increment to the logged value (`round1(working + inc)`), so the announced step is the step delivered. Bodyweight exercises progress in reps up to `repsMax`, then add sets up to `MAX_BW_SETS` (6), then hold and advise harder variations. Greyskull doubles the increment when the final AMRAP reaches 2× target. Entries predating v1.2.2 have no stored `target`; they are judged against the current plan so old history isn't scored all-miss. Prescriptions carry a translatable `why` template — the UI can always answer "why this number?" See [ADR 0011](adr/0011-progression-streams-and-runs.md).

### Recovery (`lib/recovery.js`)
Fatigue per session: intensity-weighted tonnage `load × reps × (load / bestEpley)^1.5` distributed over muscles by snapshot weights (cardio counts minutes × 50 kg proxy). Unlike `estimate1RM`, which returns `null` above `REP_CAP`, `bestEpley` deliberately clamps reps at `REP_CAP` using the shared Epley formula from `lib/onerm.js` so high-rep sets keep an intensity weight rather than falling back to 1.0 raw tonnage. Sessions are normalized against a causal EWMA reference built only from *earlier* sessions, then accumulated with a half-life of `FATIGUE_HALF_LIFE_MS` (36 h) through saturating `1 − e^−v`, scanned over `FATIGUE_SCAN_MS` (30 days). Deleting a workout can therefore never raise fatigue. Strength retention holds at full for `STRENGTH_FULL_MS` (14 days) then decays with a `STRENGTH_HALF_LIFE_MS` (28-day) half-life toward a 0.5 floor. The monotonicity invariant is enforced as a property test by `scripts/fatigue-monotonic-probe.mjs` (`npm run test:fatigue-probe`).

### Muscle mapping (`lib/muscles.js`)
Effective-set weights: target 1.0, synergist/secondary 0.4. Free-text muscle names collapse onto 19 drawable slugs via a curated alias table; customs without metadata fall back to by-bodypart distributions.

## Import / export

- **Backups** (`views/Settings.jsx`): plain JSON of `S`, validated minimally (must contain `workouts` and `routines`, and must not come from a newer Sky), cleaned and swapped in atomically via `replaceState`, which runs `admit`. Nothing is overlaid on `DEF` first, so a backup without `schemaVersion` is upgraded from version 0 and `admit` fills what it lacks. The keys a Restore copies derive from `DEF` (minus the in-flight `active`, plus the legacy `exWeights` and `streakRule`, no longer read, and `showRir`, which the 0 → 1 step turns into `effort`), so a new DEF key needs no second list.
- **Other apps** (`lib/import-csv.js`): one-set-per-row CSV from Strong, Hevy, FitNotes (iOS + Android dialects detected by signature headers), plus Apple Health `export.xml` for weigh-ins. Dates resolve day-first when ambiguous; units convert per row against the profile unit; effort columns follow blank ≠ rated, RIR wins if both present, cap at 10. Exercise matching refuses to guess on ties (the row becomes a custom exercise instead). Extending the curated `ALIAS_EX` table is the sanctioned way to improve match accuracy. Re-importing never duplicates: merge dedupes **by date**, existing days win.
- **Plan share** (`lib/plan-share.js`): self-contained JSON bundles tagged `sky_plan: 1` (`PLAN_FMT = 1`), carrying the exporting Profile's `unit`; import converts `weight` and `inc` into the importing Profile's unit, and a file without `unit` imports as it is. Merge guarantees: routines always get fresh ids (never overwrite), customs dedupe by name+bodypart, optional `schedule: true` replaces the whole week. Also renders printable HTML.

## i18n & instructions

Sky ships English only ([ADR 0003](adr/0003-english-only.md)). English strings are still wrapped in `t('literal')` and act as their own keys — `t()` passes them through (substituting `{0}`-style args), so re-introducing a language later remains a one-file change around `lib/i18n-core.js`. The old locale/instruction packs and their key-parity check scripts were deleted with ticket 05; exercise instructions always render from the catalogue's English `st` field via `instrFor()`.

## Build, PWA, mobile shells

- `vite.config.js`: `base: './'` so the build runs from any static path; there are no dev proxies — Sky has no server, and local media is served straight from `public/`; no analytics is injected, so builds are telemetry-free.
- `public/sw.js`: hand-written runtime service worker. Exercise media (`/media/images/`, `/media/videos/`) cache-first; everything else network-first with cache fallback; final fallback is the cached SPA shell. Rest timer notifications use the Notification API directly.
- Exercise media: fetched out-of-band into gitignored `frontend/public/media/` via `npm run media:fetch` (cross-platform `scripts/fetch-media.mjs`); Vite copies it verbatim into `dist/` when present, and the app falls back to the pinned CDN per asset when not.
- Generated artifacts: `lib/exercises-data.js` (dataset of 1,324 exercises) and `lib/body-paths.js` (muscle-map SVG geometry) are generated/pinned — do not edit. Exercise images/GIFs stream from a pinned jsDelivr commit (`VITE_IMG_BASE`/`VITE_GIF_BASE`); they are licensed media and are never committed.
- Mobile shells (`frontend/android/`, `frontend/ios/`) are stock Capacitor wrappers around `dist/`; `npm run build:mobile` rebuilds with `VITE_MOBILE=1`, pins CDN media bases, then runs `cap sync`.

## Testing

Vitest, run with `npm test` in `frontend/`. Tests sit next to the code they cover. Three DOM strategies coexist: **linkedom** (Modals/Workout tests), **happy-dom** (Stats recovery, Workout.remove, boot smoke), and DOM-free pure tests. The fatigue model's monotonicity invariant has its own standalone property-test harness (see Recovery above).
