# Session boundary progression and live milestone cues

Status: Accepted, 2026-10-30. Amended by [0018](0018-milestone-cue-reads-the-prescription.md): the Milestone cue uses the Prescription's judgement.

## Decision

1. **Prescriptions change only at the Session boundary.** Every Progression policy (linear, double, Greyskull, add-time) computes the next Prescription when an Active workout finishes into a Workout. Targets stay the same for every planned Work set of an Active workout; nothing is recalculated mid-session from earlier sets.
2. **A session is judged as a whole,** not set by set (dynamic double progression was rejected). Under linear progression every Work set must hit the target reps for the load to go up. Under double progression every Work set must reach the top of the rep range first; ADR 0011 adds Rep progress below the top.
3. **Milestone cues.** When a Work set is checked off, the Active workout shows a small inline cue: the set reached its target, or, on the last planned Work set, what the next Prescription will record. A cue is never a modal. A set below target stays neutral, with no warning or red. Warm-up sets get no cue. A cue updates at once when a Set is unchecked or edited.
4. **Progression summary.** The workout complete sheet lists the next Prescription for every trained exercise. A Deload or a hold is worded as guidance, not as failure.
5. The same rules apply to every Progression policy.

## Consequences

- Straight sets keep one load, so there are no plate changes during rests.
- Progression stays a pure reading of the Training log.
