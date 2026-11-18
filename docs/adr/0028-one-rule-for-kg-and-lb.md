# One rule for kg and lb

Status: Accepted, 2026-11-18. Implemented 2026-11-18 (`.scratch/docs-review-2026-11/issues/01`). Amends ADR 0017
and 0019.

## Context

The docs gave three answers to "what does switching kg/lb do?". The Settings footer and the README said nothing is
converted. ADRs 0017, 0019 and 0021 convert history when it is read: Workouts carry a unit stamp, and readings come
out in `S.unit`. Routine targets carry no unit, so a switch relabelled them: a 60 kg target read as 60 lb.

## Decision

1. **Logs are never rewritten.** A logged number keeps the value it was entered with. It is read in `S.unit` through
   the unit stamped on it (`set.unit ?? entry.unit ?? workout.unit`, and `unit` on a Weigh-in).
2. **Plans and settings convert in place.** A Routine's `weight` and `inc` and the Goal weight have no stamp. A switch
   converts them inside the same `update` as the unit change, rounded the way `normalizeWeight` rounds (ADR 0019).
3. **A switch fills missing stamps.** A Workout or Weigh-in with no stamp was being read in whatever `S.unit` was, so
   a switch changed its meaning. The switch writes the outgoing unit into it. No number and no existing stamp changes.
4. **No switch during a workout.** The Workout view, the live progression cues and Routine sync all read the Active
   workout in `S.unit`. A switch is refused while one exists, so its numbers and its stamp always agree.
5. **A plan file carries its unit.** Export writes `unit`; import converts the loads into the importing Profile's
   unit. A file without `unit` is read in the importing Profile's unit, as before.

One function does the switch: `switchUnit(S, unit)` in `lib/units.js`, called by the Settings control.

## Inventory

Every stored number that is a load or a body weight, as of `main@c989468`.

| Stored number | Kind | Stamp | On a switch | Read |
|---|---|---|---|---|
| Routine `ex[].weight` | plan | none | converted in place | as stored |
| Routine `ex[].inc` | plan | none | converted in place, except in time Mode, where it is seconds | as stored |
| `targetW` (Goal weight) | setting | none | converted in place | as stored |
| Workout Set `w` | log | `set.unit ?? entry.unit ?? workout.unit` | missing Workout stamp filled | converted |
| Workout `bw` (Session body weight) | log | `bwUnit ?? workout.unit` | missing Workout stamp filled | converted |
| Workout Entry `target.weight`, `target.inc`, `plan.weight` | log (frozen Target and Prescription) | the Workout's | missing Workout stamp filled | converted |
| Workout Entry `topW` | legacy log (ADR 0020) | the Workout's | missing Workout stamp filled | converted |
| Weigh-in `w` (Body-weight log) | log | `unit`, new with this ADR | missing stamp filled | converted |
| Active workout Sets, `target`, `plan`, `bw` | log in progress | `active.unit` | switch refused | as stored, always in `S.unit` |
| `exWeights` | legacy, unread (ADR 0021) | none | untouched | not read |
| Plan file `routines[].ex[]` `weight`, `inc` | plan leaving the Profile | `unit`, new with this ADR | n/a | converted in place on import |
| CSV and Apple Health imports | log | none; converted to `S.unit` when imported | stamp filled at the next switch | converted |
| Backup restore | whole Profile with its own `unit` | consistent | n/a | n/a |
| Built-in plans (starter, hypertrophy) | plan | none | converted in place like any Routine | as stored |

Not loads: `sec`, `min`, `speed`, `restSec`, `volumeRanges`, `customEx`. Not stored: the 1RM calculator and the plate
maths.

What the inventory found:

- **CSV and Apple Health imports had no stamp.** Their numbers are converted to `S.unit` when imported but nothing
  records that unit, so a switch relabelled them. Decision 3 covers them and every older unstamped Workout.
- **Weigh-ins had no stamp.** They are a log, so they are not converted in place. Leaving them relabelled was not an
  option once the Goal weight converts: Home would have compared 80 "lb" with a 176.4 lb goal. Decision 3 stamps
  them, and every Body-weight log reading now honours the stamp, through `weighIns(S)` in `lib/bodyweight.js`
  (Home, the weigh-in sheet, Stats, strength levels) or the stamp directly (the body weight in kg).
- **The Active workout has a stamp, but nothing reads it.** Decision 4.
- **Some history readings skipped the stamp:** last session (`lastSession`, which seeds the next Workout's rows and
  shows "Last time"), the Prescription and Target fallbacks in `sessionsFor`, the Session body weight in strength
  levels and on the Workout detail sheet, and the set labels on the Workout detail sheet and in Stats' exercise
  sessions. They now read in `S.unit` (`setIn`, `targetIn` and `sessionBodyweight`).
- **The hypertrophy plan writes `inc: 2.5` whatever the unit**, meaning kg. In a lb Profile it loads as a 2.5 lb step.
  Not changed here; `lib/plans/` belongs to ticket 02.

## Considered options

- **Convert all history in place on a switch.** Rejected: history is never rewritten (ADR 0017), and lb → kg → lb at
  one decimal does not round-trip (100 lb → 45.4 kg → 100.1 lb).
- **Stamp plans and convert them on read.** Rejected: plans are edited, not logged. Every stepper, the Routine editor,
  the plan file and progression would have to convert both ways.
- **Convert the Active workout in place.** Rejected: its performed Sets are a log.
- **Let the Active workout keep its old stamp through a switch.** Rejected: Sets typed after the switch would be
  stored in the new unit under the old stamp.

## Consequences

- A 60 kg target reads 132.3 lb after a switch, and 60 kg again after switching back. A plan written in lb drifts by
  up to 0.1 lb per round trip.
- Profiles change shape the first time they switch: unstamped Workouts and Weigh-ins gain `unit`.
- A lifter mid-workout is asked to finish or discard it before switching.
- A plan file exported from a lb Profile imports into a kg Profile in kg.
