# Progression reads a stream, and stalls read a run

Double progression judged every session below the top of the rep range as a Miss. A deload
prescribed the bottom of the range, which could never be a Hit against the frozen top Target,
so the next session was a Miss too and deloaded again: 40 → 35 → 32.5 → 30 → … until the
minimum load. The same shape of bug made wide rep ranges unusable (the third climb session
deloaded before reaching the top), let another Routine or a previous policy contribute a
spurious Hit (heavy 5s made a light 10–12 plan jump to 62.5), announced a +2.5 kg step while
moving an off-grid 41 kg bar by 1.5 kg, and left add-time stuck at 40 s after a deload because
it kept backing off the frozen 45 s Target rather than the duration actually prescribed.

Fix: the next Prescription is derived from a **Progression stream** and its current **Run**,
not from every historical Entry of the exercise.

- A Progression stream is the Target's shape: exercise, Mode, planned set count, and top reps
  or seconds. Working weight, `repsMin`, per-side logging, and the policy are outside the
  shape. A different Target shape starts a new stream; changing policy, the bottom of the
  range, or the load does not. A new stream's first session is a baseline, and its rows seed
  from the last working weight in the same Routine (else the Routine's plan weight), never
  from an unrelated Routine's heavier history.
- A Run is the trailing block of stream sessions at the same working value — the logged
  working load for reps work, the prescribed hold duration for add-time. Its first session is
  a baseline and is never a Stall. Greyskull is the deliberate exception: its rule is reset on
  any Miss, so a Miss at the reduced load resets again from that load.
- Double progression keeps `readSession.ok` as "reached the Target top". Separately, a session
  makes **Rep progress** when its weakest planned Work set reaches the aim
  `min(top, max(bottom, previous.low + repStep))`. A Stall is a session in the current Run
  after its baseline that is neither a top hit nor Rep progress. Four such sessions trigger a
  Deload (three for add-time); a progress session clears the count. This makes any rep range
  climbable: a 10–14 range advances 10 → 11 → 12 → 13 → 14 without a deload.
- A Deload backs off by roughly 10 % from the current working value, snapped to the equipment
  or timer grid, never below one Increment (5 s for a hold). Rep work returns to the bottom
  of the range. The first session at the new value is a new Run baseline, so following the
  Deload exactly builds up instead of cascading. When the value cannot go lower the
  Prescription holds at the same value and says so.
- Add-time climbs from the weakest performed hold, not the frozen Target (`min(working,
  weakest + 5 s)`), and advances by the Increment from the value actually achieved. A Deload
  backs off that achieved value, so a 30 s session can prescribe 25 s rather than repeatedly
  falling back to the original Target. The Routine Target stays the starting point; a
  Prescription may exceed it.
- Every `up` adds the exact Increment to the logged working value (`round1(w + inc)`), so an
  off-grid 41 kg + 2.5 kg announces and delivers 43.5 kg. Snapping stays a Deload concern.
  This applies to linear and Greyskull too.
- Finished Entries persist the resolved Prescription as `plan` (`kind`, `weight`, `reps`,
  `sec`, `sets`). Later sessions need it for exact add-time boundaries, the reps a bodyweight
  climb was asked for, the working set count after volume growth, the load a skipped session
  was asked to use, and for identifying a Deload; older Entries fall back to deriving the same
  reading from Target and sets. No stall counter is stored — Runs are still a pure reading of
  the log.

Deferred, deliberately: the bodyweight + double configuration still ignores `repsMin`
because the bodyweight branch runs first, and a Routine-level double still resolves to `off`
on timed exercises. Both are configuration/UX clarifications, not part of this progression
decision.

Consequences: double progression cannot deload on a session that made rep progress; a deload
has a visible build-up; two Routines with different Target shapes no longer contaminate each
other; an add-time deload survives the next session; a bodyweight rep climb and its added
sets survive the next session instead of resetting to the Target. Legacy Entries without
`plan` keep their old Target-derived reading, so imported and pre-1.2.2 history does not
mass-deload on upgrade.
