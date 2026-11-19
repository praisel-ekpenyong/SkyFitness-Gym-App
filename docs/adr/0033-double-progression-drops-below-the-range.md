# Double progression drops on a first set below the range

Status: Accepted, 2026-11-19.

## Context

Double progression only ever lowered the load through a Deload: about 10 % after four sessions without Rep progress. A session well below the rep range (6 reps on 8–12) read as one more Stall at the same weight, so a lifter who started too heavy, or took too big a jump, ground through four sessions before anything changed. The load advance had no mirror.

## Decision

- **Trigger.** At the Session boundary, double progression reads the **first** planned Work set. If it was performed and its reps are below the rep-range bottom, the next Prescription is a **Drop** (kind `down`). Later sets falling off is normal fatigue and never triggers one; an unperformed first set never does either.
- **Size.** One Increment off the working load as logged, not snapped. Reps return to the range bottom. The why reads: "First set 6 reps, below the 8–12 range. 2.5 kg less, back to 8 reps."
- **Timing.** One session is enough, a Run baseline included, so a jump that turns out too big is undone at once.
- **Precedence.** A Drop wins over a Stall-count Deload on the same session. A Drop starts a new Run, which clears the Stall count; the 10 % Deload stays for Stalls inside the range.
- **Floor.** If one Increment off would leave less than one Increment, the Prescription holds with the "Lightest load" message, like the Deload floor.
- **Bounce guard.** When the current Run's load equals the load of the Run before the heavier one, and that earlier Run ended in a Hit, a Hit no longer advances on its own: the current Run needs two Hits (not necessarily consecutive). The first Hit holds with "Top again: one more time at this weight before adding 2.5 kg, since the last jump was too big." The guard looks back one Run, reads only loads and Hits from the log (no stored state), and applies the same way on every later bounce.
- **Scope.** Double progression with load only. Linear and Greyskull already lower the load on Misses, add-time has no range, and loadless bodyweight work has nothing to drop.
- **UI.** No live Milestone cue; the Drop shows in the Progression summary only ("Drop 2.5 kg, back to 8 reps", down arrow).

## Consequences

- A sick or bad day whose first set falls below the range now drops the load the next session, where it used to count as one Stall (scenario 2 of the hypertrophy plan).
- Policies stay pure readings of the log: an existing history whose latest session already sits below the range prescribes a Drop as soon as this ships. Frozen Prescription records are untouched.
