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
A one-off replacement (or declared rest) for what the week schedule says on one specific date. In lifter-facing UI copy and badges, this is presented as "Rescheduled" (e.g. `todayOvr` indicators).
_Avoid_: re-planning

**Plan file**:
The shareable bundle: routines, the week schedule, and the custom exercises those routines use. Never carries workouts, weigh-ins or settings; importing it adds fresh routines, never overwrites yours.
_Avoid_: calling it "the plan"

### Exercises

**Catalogue**:
The built-in exercise dataset — each entry has a name, body part, equipment, target muscle and secondary muscles.
_Avoid_: library (that's the browsing screen), exercise DB

**Custom exercise**:
An exercise you created yourself, kept in the profile and treated as part of the catalogue everywhere.

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

**Work set**:
Any set that is not a warm-up. All metrics, judgements and policies read work sets only.

**Warm-up set**:
Prep sets explicitly marked as such; excluded from every metric, judgement and progression decision.
_Avoid_: treating an unticked warm-up as a miss

**Freestyle**:
Adding an exercise to a workout without a routine; seeded from the last time it was trained, not generic defaults.

**Superset**:
Adjacent entries paired to be trained back-to-back. Pairing is positional: reorder or unlink and the group dissolves.
_Avoid_: circuit, giant set

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
How a session is judged against its target. A performed set that reached its target is a hit; fewer reps, an unticked set, or sets that were never added are misses. A session that fell apart cannot advance the load. In the progression engine and session evaluators (`readSession`, `stallCount`), this boolean judgement is represented as `.ok`.

**Progression policy**:
The named rule that derives the next target from history: off, linear, Greyskull LP, double progression, add-time. Policies are pure readings of the log — fixing a mistyped set immediately changes the next prescription.

**Prescription**:
The concrete next target a policy produces — weight/reps/seconds/sets — together with the reason it chose them. Always auditable; a suggestion you can't explain is one you stop trusting.
_Avoid_: suggestion

**Increment**:
The step a fully hit session adds — bigger for lower-body lifts, overridable per exercise.

**Stall**:
Consecutive missed sessions, counting back from the most recent.

**Deload**:
Cutting the working weight roughly 10% after enough stalls, landing on a loadable step; never below one increment.

**AMRAP**:
Greyskull's final set, taken to failure. Doubling its target reps earns a double increment.

**Bodyweight progression**:
No load to add, so progress runs in reps up to a rep-range ceiling, then in added sets up to a set ceiling; past that, the honest advice is added load or a harder variation — a human decision, not a policy.

### Strength & recovery

**Estimated 1RM**:
A one-rep-max estimated from a submaximal set (Epley by default). Refused above 12 reps, where the formulas disagree wildly; a real single is a measurement, not an estimate.
_Avoid_: e1RM in user-facing prose

**Record**:
A set whose estimated 1RM beats every estimate before it, kept on the workout where it happened.

**Effective sets**:
Training load per muscle counted in sets, weighted primary 1 / secondary 0.4 — deliberately not in kilograms, because tonnage across exercises compares nothing.

**Tonnage**:
Load × reps of performed sets; the raw material fatigue is computed from, weighted by intensity relative to the lifter's own capacity.

**Fatigue**:
Per-muscle accumulated stimulus that rises with hard volume and fades with a ~36-hour half-life. Bucketed: **ready** below 0.25, **recovering** to 0.5, **fatigued** above.
_Avoid_: freshness (its inverse)

**Retained strength**:
How much of a muscle's trainedness remains: full for 14 days after the last work set, then halving every 4 weeks toward a floor of 0.5. The same model applied per-exercise drives the Strength view's "current 1RM".
_Avoid_: detraining as a negative verdict — below-full-retention muscles are simply the ones worth training

**Muscle map**:
The eighteen drawable muscles in head-to-toe order (also the order of any derived list). Dataset spellings collapse onto them via aliases; anything undrawable is dropped, not guessed. Inert regions (head, hands, joints) are drawn but never shaded.
