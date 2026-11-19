# The Training log is the only reading, in the Profile's unit

Status: Accepted, 2026-11-19. Supersedes 0017, 0019, 0021, 0022 and 0028.

## Decision

### One module reads the log

`lib/training-log.js` reads, from the finished Workouts alone:

- Best;
- Records;
- last session, in any Routine or in one Routine;
- the latest Work set time;
- Tonnage;
- the chart metric;
- the Estimated 1RM series and the standing best estimate.

Every function takes the Profile first (`(S, exId)` or `(S, workout)`) and answers in `S.unit`. None takes a unit argument or a formula argument. Caches are internal, keyed on the `S.workouts` array and the unit. `update` keeps that array's identity when a change does not touch the log (ADR 0026), so the caches survive a Set tap.

- **Best** is the heaviest performed Work set of the exercise, in any Mode, rounded to 0.1. Deleting a Workout takes its Best with it.
- **A Record is read, never stamped.** A Workout sets a Record for an exercise when its heaviest Set (load) or its best Estimated 1RM Set beats every earlier performed Work set of that exercise.
  - Earlier means earlier in date, then start time, then position in the log.
  - Beating means strictly greater.
  - An exercise is judged once per Workout, across all its Entries.
  - When both kinds would count, it is the load Record.
  - The first session with a load or an estimate is a baseline, not a Record.
- **The chart metric** is one Entry's result in its own Mode: the heaviest performed reps Work set, the longest hold in seconds, or the greatest cardio speed in km/h. It is 0 when nothing in that Mode was performed. Best and the chart metric stay two readings: a mixed-mode Entry may be 90 on Best and 40 on the chart.
- **The Estimated 1RM series** has one point per Workout: the estimate that Workout's Record uses, across every Entry of the exercise. The standing best estimate is the greatest point; a tie keeps the earlier one.
- **Tonnage** is load × reps of performed Work sets.
- **Last session** is the latest Workout with a performed Work set of the exercise. Its Sets span every Entry of the exercise, and its Sets and Target are in `S.unit`.

Nothing else remembers these readings. New Workouts write neither `exWeights` (a heaviest-ever cache) nor `prs` (Records stamped at finish), and nothing reads them. Old Profiles keep both, unread; Restore carries `exWeights` as a legacy key. Where progression used the all-time `exWeights` hint (ADR 0011), it reads Best.

The Epley formula (`estimate1RM` in `lib/onerm.js`, refused above 12 reps) also serves where a typed weight and rep count are estimated, as in the catalogue calculator. Fatigue keeps its own stimulus formula, which adds body weight.

### One rule for kg and lb

1. **Logs are never rewritten.** A logged number keeps the value it was entered with. It is read in `S.unit` through the unit stamped on it:
   - a Set: `set.unit ?? entry.unit ?? workout.unit`;
   - the Session body weight: `bwUnit`, else the Workout's unit;
   - a Weigh-in: its own `unit`.

   No stamp means `S.unit`. The conversions live in `lib/units.js` (`normalizeWeight` rounds to 0.1). The Body-weight log is read through `weighIns(S)` and `sessionBodyweight` in `lib/bodyweight.js`. Progression's `sessionsFor` reads Sets, the frozen Target and the Prescription the same way.
2. **Plans and settings convert in place.** A Routine's `weight` and `inc` and the Goal weight (`targetW`) carry no stamp. A switch converts them inside the same `update` as the unit change. A time-Mode `inc` is seconds and never converts.
3. **A converted Increment snaps to a plate step** (ticket 15, amending ADR 0028). An Increment is a plate step, not a measured load. It converts, then rounds to the nearest multiple of the target unit's smallest plate step (1.25 kg, 2.5 lb), and never below one step: 2.5 kg becomes 5 lb, 1.25 kg becomes 2.5 lb, and 10 kg becomes 22.5 lb. The switch, plan import and reads of a frozen Target all snap the same way. Loads still convert exactly. The default Increment, used when `inc` is absent, is already a plate step in each unit (2.5 or 5 kg, 5 or 10 lb) and never converts. Until ticket 15 merges, `main` converts an Increment like a load (2.5 kg becomes 5.5 lb).
4. **A switch fills missing stamps.** It writes the outgoing unit into every Workout and Weigh-in that has no `unit`. No number and no existing stamp changes. Workouts finished in Sky carry the Active workout's unit. Weigh-ins and CSV and Apple Health imports are written in `S.unit` without a stamp, and get one at the next switch.
5. **No switch during a workout.** The Active workout is read in `S.unit`, so a switch is refused while one exists.
6. **A plan file carries its unit.** Export writes `unit`. Import converts the loads into the importing Profile's unit. A file without `unit` is read in the importing Profile's unit. The built-in 5-day plan is a plan file in kg and loads the same way (`mergePlan`); the starter plan carries no loads.

One function does the switch: `switchUnit(S, unit)` in `lib/units.js`, called by the Settings control.

## Where the code differs from the earlier ADRs

The code wins; these are the facts on `main`.

- **Best also reads a legacy `topW`.** ADR 0021 said Best is the heaviest performed Work set. On an Entry whose Target is reps (or has no Mode) and that has no Warm-up set, a heavier `topW` raises Best, and can make a load Record with no Set behind it. The chart metric is stricter: the Entry must also have a performed reps Set and no Work set in another Mode.
- **CSV import still writes `topW`.** ADR 0020 says new Workouts stop writing it. That holds for Workouts finished in Sky. CSV import sets it to the heaviest imported Work set. Every imported Set is performed, so it changes no reading.
- **Strength levels estimate on their own.** ADR 0022 moved the per-exercise series into the Training log. `lib/strength-level.js` still walks the log itself, because one lift spans several exercises. It calls `estimate1RM` with the Set's stamp and `S.unit`.
- **Fatigue reads in kg.** `lib/recovery.js` converts every load to kg, not `S.unit`, through its own stamp lookup. That lookup also accepts the stamp spellings `u`, `weightUnit`, `weight_unit` and `loadUnit`.

## Considered options

- **Keep `exWeights` as Best.** Rejected: a typo or a deleted Workout would stay as Best forever.
- **Keep stamping `prs` and re-stamp history on every delete or import.** Rejected: a second copy of what the log already says.
- **Score the chart with Best.** Rejected: Best answers "heaviest load in any Mode"; the chart answers "this Entry's Mode".
- **Convert all history in place on a switch.** Rejected: history is never rewritten, and lb → kg → lb at one decimal does not round-trip (100 lb → 45.4 kg → 100.1 lb).
- **Stamp plans and convert them on read.** Rejected: plans are edited, not logged. Every stepper, the Routine editor, the plan file and progression would have to convert both ways.
- **Convert the Active workout in place, or let it keep its old stamp.** Rejected: its performed Sets are a log, and Sets typed after the switch would be stored under the wrong stamp.

## Consequences

- Every screen shows the same Best. Deleting or importing a Workout changes which Sets read as Records.
- Logging a brand-new exercise shows no trophy; imported history shows Records.
- A 60 kg Routine target reads 132.3 lb after a switch, and 60 kg again after switching back. A plan written in lb drifts by up to 0.1 lb per round trip. An odd Increment can change on a round trip: 3 lb becomes 1.25 kg, then 2.5 lb (ticket 15).
- A lifter mid-workout is asked to finish or discard it before switching.

## History

- **0017** (2026-10-31): the Estimated 1RM, Records and strength curves are read in `S.unit` through the unit cascade, and history is never rewritten.
- **0019** (2026-11-08): the same normalisation for progression, the Top-set curve and Tonnage, with `lib/units.js` as the one home of the conversion.
- **0021** (2026-11-16): Best, Records, last session and Tonnage move into `lib/training-log.js`. `exWeights` and `prs` stop being written, and `mergeExWeight` and `heaviestForEntry` are deleted. It amended ADRs 0006, 0011 and 0020.
- **0022** (2026-11-16): the chart metric and the Estimated 1RM series join the Training log; Best and the chart stay two readings.
- **0028** (2026-11-18): one rule for kg and lb. It replaced 0017's "switching only changes the label" and 0019's "routine definitions remain immutable", and listed every stored load. Ticket 15 amends it: a converted Increment snaps to a plate step.
