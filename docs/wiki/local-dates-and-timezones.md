# Local Dates and Timezones

Related: [Wiki Index](index.md) · [Docs Path Guardrail](docs-path-guardrail.md) · [PR and Worktree Discipline](pr-and-worktree-discipline.md) · [CODING_STANDARDS.md](../../CODING_STANDARDS.md)

## Decision: Local Day Keys and Midday Day Parsing

On 2026-11-24, PR #142 (`praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb`, closing #132 and #133) finalized Sky's local-date convention across `frontend/src/lib/`:

- **Day keys use `todayISO()` (`lib/dates.js`), never `toISOString().slice(0, 10)`.** Calling `toISOString()` converts to UTC before slicing `YYYY-MM-DD`, which shifts late-evening sessions in UTC-negative time zones onto tomorrow's calendar date (for example, `2026-03-10T22:00:00-08:00` in `America/Los_Angeles` serialized as `2026-03-11`). On 2026-11-24 (`bbf7b5a`, merged in `8de9fcb`), `evaluateSessionProgression` in `lib/progression.js` switched its unsaved-entry stand-in Workout fallback from `new Date().toISOString().slice(0, 10)` to `todayISO()` (closing #132).
- **Date-only strings use `parseDay(d)` (`lib/dates.js`), never `new Date('YYYY-MM-DD')`.** Under ECMAScript, `new Date('YYYY-MM-DD')` parses as UTC midnight (`00:00:00Z`), placing unstamped Workouts and Weigh-ins on the prior local evening in UTC-negative zones and sorting them hours away from stamped entries on the same day. On 2026-11-24 (`c95574c`, merged in `8de9fcb`), `lib/dates.js` added and exported `parseDay(d)`, which parses `d ? new Date(d + 'T12:00:00') : new Date(NaN)` at local midday (`12:00:00`) to avoid DST boundary shifts around midnight. As of `praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb`, `fmtDate`, `weekKey`, `mondayOf`, and `workoutTimestamp` (`lib/dates.js`), `latestWorkSetAt` (`lib/training-log.js`), and `parseWorkoutCSV` / `parseBodyweight` (`lib/import-csv.js`) all read date-only `YYYY-MM-DD` strings through `parseDay` (closing #133).

## Pitfall: Adding Midnight Offsets onto `parseDay`

During PR #142, commit `c95574c` initially replaced `new Date(d + 'T00:00:00').getTime()` with `parseDay(d).getTime()` as the base timestamp in `lib/import-csv.js` (`parseWorkoutCSV` and `parseBodyweight`), while leaving `day.start ?? 18 * 3600000` in place. As of `c95574c` (2026-11-24), `parseWhen` in `lib/import-csv.js` computed `when.t` (copied to `day.start` and `day.end`) as milliseconds elapsed since midnight (`00:00`), so adding those offsets onto `parseDay` (`12:00`) shifted timed Workouts and Weigh-ins forward by +12 hours and pushed late-evening imports onto the next local calendar day, while date-only Workouts landed +18 hours past noon (`06:00` the next day).

On 2026-11-24, review commit `05ecbd4` (merged in `praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb`) separated the two cases in `lib/import-csv.js`:

- **Timed rows** (`day.start != null` or `when.t != null`): computed local midnight via `new Date(parseDay(d).setHours(0, 0, 0, 0)).getTime()` and added the millisecond offset (`day.start`, `day.end`, or `when.t`) to midnight.
- **Date-only rows** (`day.start == null` or `when.t == null`): used `parseDay(d).getTime()` directly (local noon, `12:00:00`).

## Stored-Data Behavior on Re-Import

As recorded on 2026-11-24 in issue #133, commit `05ecbd4`, and PR #142 (`praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb`):

- Previously stored timestamps already saved by earlier imports were left unmigrated in place.
- Re-importing date-only CSV Workouts that carry no timestamp stamped them at local noon (`12:00:00`) instead of `18:00:00` as of `8de9fcb` (matching date-only Apple Health Weigh-ins and `workoutTimestamp`).

## Downstream Work and Standards Links

- **Unblocked lint guardrail (#110):** As of `8de9fcb` on 2026-11-24, PR #142 satisfied the `parseDay` helper requirement and removed the four `new Date(d)` sites and the `lib/progression.js` `toISOString().slice(0, 10)` site cited in [CODING_STANDARDS.md](../../CODING_STANDARDS.md) ("Local dates, never UTC"), unblocking the `#132` and `#133` prerequisites on open issue #110 ("Local-date selectors and a day parser", which also listed #101 merged and #104 open on 2026-11-24).
- **Deferred clock injection (#113):** As of `praisel-ekpenyong/SkyFitness-Gym-App@8de9fcb`, `evaluateSessionProgression` in `lib/progression.js` still read wall time indirectly via `todayISO()`; passing an explicit `now` argument per [CODING_STANDARDS.md](../../CODING_STANDARDS.md) ("The clock is an argument in `lib/`") was explicitly deferred to open issue #113.
- **No ticket numbers in code comments:** During PR #142 review (`05ecbd4`), references to `#132` and `#113` were stripped from comments in `lib/progression.js` and test descriptions in `frontend/src/lib/progression.test.js` per the "Comments" rule in [CODING_STANDARDS.md](../../CODING_STANDARDS.md).
