# An exercise may set its own Rest duration

Status: Accepted, 2026-11-18. It amended ADR 0023 on what the effect runner reads for a rest; that rule is now part of [0032](0032-the-active-workout.md).

## Context

Sky had one Rest duration, the Profile's `restSec`. The built-in 5-day plan asks for 180 s on compound lifts and
90–120 s on isolation work. It worked around the single duration: it set the Profile's to 180 s only when it was
still the factory 90 s, and wrote the isolation rests into notes. An earlier wontfix pointed at ±30 s keys on the
rest dock; the dock has ±15 s keys, so a lifter adjusting every rest by hand pays several taps per set.

## Decision

1. **The field.** An exercise in a Routine (`ExCfg`) may carry `rest`, its own Rest duration in seconds. Absent, the
   Profile's `restSec` applies. The config sheet stores it only when it differs from the Profile's, like the other
   config fields, so "Default" follows Settings when Settings changes. Anything but a positive number reads as absent
   (`ownRest` in `lib/workout-model.js`).
2. **Freezing and the effect.** Target freezing copies `rest` into the Entry's `target`, so editing the Routine
   mid-workout does not change the Active workout. When a performed set starts a rest, `act` emits `rest:start` with
   `sec` if any Entry of the Step has its own Rest duration, and with no `sec` otherwise. The runner in
   `store/effects.js` rests for `sec`, else for `S.restSec`. A Manual rest uses the Profile's.
3. **Supersets: the longest Rest duration in the Step.** The rest after a Superset round, and after the Superset when
   another Step follows, is the longest Rest duration among the Superset's Entries, where an Entry on Default counts
   as the Profile's. To weigh a Default member against members with their own, `act` reads `S.restSec`; this is the
   only place the Active workout reads it.
   - Why not the Entry whose set ended the round: a round ends on whichever member still has work. With members of
     different set counts the rest would change partway through the same Superset.
   - Why not the first Entry: a compound paired after an isolation lift would get the isolation lift's short rest.
   - Why the longest: a Superset is usually a compound with an accessory, and too short a rest costs the compound's
     next round. A rest that is too long costs only time; the dock's skip and −15 s keys cut it short.
4. **Carried everywhere a Target goes.** Plan files (`lib/plan-share.js`) export and import `rest`. Routine sync
   (`lib/routine-sync.js`) writes the frozen Target back, `rest` included; it is not a reported change, because the
   Active workout has no control that edits it.

## Consequences

- The config sheet has one Rest duration row, a `SelectRow` like the one in Settings, offering Default and the same
  durations (`REST_CHOICES`). A plan-file value off that list is shown and kept.
- A finished Workout's frozen Target keeps `rest`. Nothing in the Training log reads it.
- The built-in 5-day plan sets its rests on its exercises and no longer touches the Profile's Rest duration.
