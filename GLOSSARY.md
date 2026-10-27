# Sky

A single-user, no-login gym and body-weight tracker: plan routines, log workouts against them, and derive progression, strength and recovery from what was actually logged. Everything lives on the device.

## Language

### Data & identity

**Profile**:
One person's data — settings, routines, week schedule, history, weigh-ins, custom exercises.
_Avoid_: user, account

**Profile display name**:
The optional name stored on the device shown in greetings on Home. Not an identity, login, or multi-person switch.
_Avoid_: user name, username, account name

**Guest mode**:
Using Sky without signing in anywhere; the profile exists only on this device.
_Avoid_: offline mode, anonymous mode

**Export**:
A complete copy of the profile as one file, for safekeeping or moving devices.

**Restore**:
Loading a full JSON backup file. Replaces the current profile state wholesale on confirmation.
_Avoid_: sync

**Reset**:
Replacing the profile with factory defaults wholesale — Restore with no backup loaded. Never touches backups or the device's storage wiring; there is nothing to undo.
_Avoid_: wipe cache, clear data, factory reset (Android OS action)

**Import**:
Bringing partial or outside data in (shared plan files, CSV histories from FitNotes/Strong/Hevy, Apple Health weigh-ins). Imports merge rather than replace — existing routines gain new IDs and existing days win, so importing never duplicates a workout.
_Avoid_: sync

**Static build**:
Sky ships as a static frontend only; there is no backend to fall back on. Every feature must work from local data alone.

### Planning

**Routine**:
A named, ordered list of exercises with targets — the reusable thing you train ("Push Day").
_Avoid_: plan, template, program, split

**Week schedule**:
Which routine belongs to each weekday.

**Day override (Rescheduled)**:
A one-off replacement (or declared rest) for what the week schedule says on one specific date. In lifter-facing UI copy and badges, this is presented as "Rescheduled".
_Avoid_: re-planning

**Plan file**:
The shareable bundle: routines, the week schedule, and the custom exercises those routines use. Never carries workouts, weigh-ins or settings; importing it adds fresh routines, never overwrites yours.
_Avoid_: calling it "the plan"

### Exercises

**Catalogue**:
The built-in exercise dataset — each entry has a name, body part, equipment, target muscle and secondary muscles.
_Avoid_: library (that's the browsing screen), exercise DB

**Custom exercise**:
An exercise you created yourself with a primary target muscle and optional secondary muscles, kept in the profile and treated as part of the catalogue everywhere.

**Favorite exercise**:
An exercise explicitly starred by the lifter for quick access across the library and exercise pickers.
_Avoid_: bookmark, starred lift, saved exercise, chosen (which is derived from history)

**Primary muscle**:
The main muscle an exercise is designed to train, receiving full (100%) training stimulus and driving the default muscle categorization.
_Avoid_: target muscle, main muscle

**Secondary muscle**:
A supporting or assisting muscle recruited during a movement, receiving partial (40%) training load against the muscle map.
_Avoid_: auxiliary muscle, helper muscle

**Muscle filter**:
The 19 canonical anatomical muscle groups (matching the body map) plus cardio, used to filter exercises in the library and exercise pickers.

**Body part**:
The coarse grouping of catalogue exercises (chest, back, waist…); also the fallback muscle mapping for customs that name no muscles.

**Unknown exercise**:
The placeholder for an id that resolves to nothing — a deleted custom, a foreign dataset. Rendered, removable, never fatal.
_Avoid_: missing exercise

### Logging a session

**Target**:
What was prescribed for an exercise before training: sets × reps/seconds/minutes, weight, and how it's logged. Finished workouts keep the target they were trained against, so history can be read back honestly. In-memory helper functions receive this configuration shape as `cfg`.
_Avoid_: plan (for a single exercise)

**Active workout**:
The one session currently in progress. At most one exists; it survives closing the app.

**Workout**:
A finished, dated training session in history: entries, a weigh-in, personal records.
_Avoid_: session (fine in prose, never as the noun for the record)

**Entry**:
One exercise within a routine or a workout; holds its sets.

**Set**:
One performance of an exercise — weight × reps, held seconds, or minutes × speed — plus whether it was performed (checked off). An unchecked set counts as not having happened, everywhere. In UI presentation components and row manipulation helpers (`insertWarmupRow`, `removeRowAt`), a set on screen is referred to as a **Row**.

**Performed**:
A set that was checked off; an unchecked set counts as not having happened, everywhere. The flag is spelled `done` in code.
_Avoid_: ticked (fine in UI copy, not as the term); completed (that word belongs to Hit/Miss judgement)

**Work set**:
Any set that is not a warm-up. All metrics, judgements and policies read work sets only.

**Warm-up set**:
Prep sets explicitly marked as such; excluded from every metric, judgement and progression decision.
_Avoid_: treating an unticked warm-up as a miss

**Session progress**:
How far the Active workout has come, counted in work sets only — warm-ups never move it. One reading of progress serves every surface that shows or asks about it.
_Avoid_: counting warm-ups toward done; a separate progress reading per surface.

**Freestyle**:
Adding an exercise to a workout without a routine; seeded from the last time it was trained, not generic defaults.

**Superset**:
Adjacent entries paired to be trained back-to-back. Pairing is positional: reorder or unlink and the group dissolves.
_Avoid_: circuit, giant set

**Rest**:
The recovery interval between sets, or between rounds of a superset.
_Avoid_: break, rest period, pause

**Rest duration**:
The default length of a rest, set by the lifter, used whenever a rest begins.
_Avoid_: rest time, rest setting

**Rest timer**:
The countdown showing a rest in progress; the same one whether the rest followed a set or was started by hand.
_Avoid_: break timer, recovery clock

**Manual rest**:
A rest the lifter starts by hand, not one that follows a performed set.
_Avoid_: quick timer, custom timer, on-demand rest

**Weigh-in**:
The body weight recorded for one specific workout, giving bodyweight-exercise loads their context.
_Distinct from_: the body-weight log below, and from "bodyweight" meaning a no-load exercise.

**Body-weight log**:
The ongoing series of daily weigh-ins on Home, with a goal weight. One entry per day.
_Avoid_: bw (on a workout that spelling means the weigh-in)

### How an exercise is measured

**Mode**:
How an exercise is logged: **reps** (weight × reps), **time** (a held duration, optionally weighted), **cardio** (minutes × speed). A mode rides on the exercise, not the body part.
_Avoid_: type

**Hold timer**:
The countdown that times a **time**-mode set while it is held, distinct from the rest timer.
_Avoid_: work timer, set timer

**Bodyweight exercise**:
An exercise that carries no load of its own, so any entered weight means *added* weight (a belted dip reads "+10 × 12"). A default from the catalogue's equipment, overridable per exercise.
_Never confuse with_: the weigh-in.

**Per-side (unilateral)**:
Reps are logged as the total across both sides; the split is derived for display, never entered. Targets therefore step by two.
_Avoid_: logging each side separately

**Effort rating**:
An optional per-set rating of closeness to failure. A set is rated on one scale and never rewritten onto the other; switching the setting changes only what future sets ask for.

**RIR / RPE**:
The two effort scales. RIR counts reps left in the tank (0 = failure); RPE reads the same thing from the top (RPE 8 ≈ RIR 2). Aggregation happens in RIR because it has a true zero.

**Hard set**:
A rated set at RIR 3 or below — close enough to failure to drive adaptation.
_Avoid_: using "hard" informally for heavy

### Judging & progression

**Hit / Miss**:
How a session is judged against its target. A performed set that reached its target is a hit; fewer reps, an unticked set, or sets that were never added are misses. A session that fell apart cannot advance the load.

**Progression policy**:
The named rule that derives the next target from history: off, linear, Greyskull LP, double progression, add-time. Policies are pure readings of the log — fixing a mistyped set immediately changes the next prescription.

**Progression stream**:
The slice of history one policy reads for one Target shape: exercise, Mode, planned set count, and top reps or seconds. Weight, the rep-range bottom, per-side logging, and the policy itself are outside the shape — changing them does not start a new stream, while changing the Target shape does. A new stream's first session is its baseline, and its rows seed from the last working weight in the same Routine (else the Routine's plan weight).
_Avoid_: exercise history (which implies every Target shape shares one); routine history (a stream can span Routines)

**Run**:
A consecutive stretch of sessions in a Progression stream at the same working value: the logged working load for reps work, the prescribed hold for add-time. A change of working value starts a new Run, whose first session is a baseline and is never a Stall. Greyskull is the deliberate exception: every Miss resets, including a Miss at a Deload's new load.
_Avoid_: streak, block

**Prescription**:
The concrete next target a policy produces — weight/reps/seconds/sets — together with the reason it chose them. Always auditable; a suggestion you can't explain is one you stop trusting.
_Avoid_: suggestion

**Prescription record**:
The resolved Prescription frozen onto a finished Entry as `plan` (`kind`, `weight`, `reps`, `sec`, `sets`), so later sessions can see what was actually asked. Entries written before it existed derive the same reading from their Target and sets.
_Avoid_: storing a stall counter

**Increment**:
The exact step a fully hit session adds — bigger for lower-body lifts, overridable per exercise. It is added to the working value as logged, not snapped from zero; only a Deload is snapped to the equipment or timer grid. For add-time the step is seconds.

**Rep progress**:
A session's weakest planned Work set reaching its aim — the previous weakest plus one rep step, clamped to the Target's rep range. Rep progress is not a Hit (the Target top is the Hit); it is the evidence that a double-progression climb is still moving, and it clears the Stall count.

**Stall**:
For linear, consecutive Misses after the current Run's baseline; a Deload starts a new Run. For Greyskull, every Miss — a reset at the reduced load is part of the program. For double progression and add-time, consecutive sessions in the current Run, after its baseline, that neither reach the Target top nor show progress — Rep progress for double, for add-time the weakest hold reaching the aim `min(working, previous weakest + Increment)`. A progress session clears the count.
_Avoid_: counting every below-top double-progression session as a Miss

**Deload**:
Cutting the working value roughly 10% after enough Stalls — load for reps work, hold duration for add-time — snapped to a loadable step or timer step, and never below one Increment (5 s for a hold). Rep work returns to the bottom of the rep range. The first session at the new value is a new Run baseline. When the value cannot be reduced, the Prescription holds at the same value and says so.
_Avoid_: cascading Deloads; a same-weight "deload"

**AMRAP**:
Greyskull's final set, taken to failure. Doubling its target reps earns a double increment.

**Bodyweight progression**:
Reps-mode progression when every performed work set was logged at zero weight, on any exercise: reps up to a rep-range ceiling, then added sets up to a set ceiling, and past that a human choice to add load or a harder variation. The target weight stands in only when no work set was performed.
_Avoid_: the Bodyweight exercise flag as the trigger. One heavier performed work set uses load progression instead. A timed session with no added weight stays on add-time.

### Strength & recovery

**Estimated 1RM**:
A one-rep-max estimated from a submaximal set (Epley by default). Refused above 12 reps, where the formulas disagree wildly; a real single is a measurement, not an estimate.
_Avoid_: e1RM in user-facing prose

**Record**:
A set whose estimated 1RM beats every estimate before it, kept on the workout where it happened.

**Effective sets**:
Training load per muscle counted in sets, weighted primary 1 / secondary 0.4 — deliberately not in kilograms, because tonnage across exercises compares nothing.

**Tonnage**:
Load × reps of performed Work sets; a Warm-up set is excluded, including when it was performed.

**Fatigue**:
Per-muscle accumulated stimulus from performed Work sets, fading with a ~36-hour half-life: loaded sets count as load × reps weighted by intensity against the lifter's own capacity, while cardio and timed holds count by duration. Bucketed: **ready** below 0.25, **recovering** to 0.5, **fatigued** above.
_Avoid_: freshness (its inverse)

**Retained strength**:
How much of a muscle's trainedness remains: full for 14 days after the last work set, then halving every 4 weeks toward a floor of 0.5. The same model applied per-exercise drives the Strength view's "current 1RM".
_Avoid_: detraining as a negative verdict — below-full-retention muscles are simply the ones worth training

**Muscle map**:
The nineteen drawable muscles in head-to-toe order (also the order of any derived list). Dataset spellings collapse onto them via aliases; anything undrawable is dropped, not guessed. Inert regions (head, hands, joints) are drawn but never shaded.
