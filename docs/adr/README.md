# Architecture decision records

One decision per file, numbered in the order it was taken. Each ADR has a `Status:` line under its title:

- **Accepted**: the decision holds. Dated amendments may follow at the end of the file.
- **Amended by N**: the decision holds, but ADR N changed part of it. Read both.
- **Superseded by N**: ADR N replaces it. The old file stays for its history; read N for the decision as it stands.

A replacement ADR states the decision as it stands, checked against the code, and ends with a short History of the ADRs it supersedes. A new ADR takes the next free number; `frontend/src/docs.test.js` fails when two ADRs share one.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-static-only-no-backend.md) | Static-only: Sky keeps no backend | Accepted |
| [0002](0002-guest-only-boot.md) | Guest-only boot, no login or demo seeding | Accepted |
| [0003](0003-english-only.md) | English-only | Accepted |
| [0004](0004-dual-write-storage.md) | Dual-write storage, newest-timestamp-wins | Accepted |
| [0005](0005-hosting-deferred.md) | Hosting target deferred; build stays host-agnostic | Superseded by 0010 |
| [0006](0006-active-workout-lifecycle.md) | Active-workout lifecycle behind a named seam | Superseded by 0032 |
| [0007](0007-row-construction-single-home.md) | Row construction has one home | Accepted |
| [0008](0008-canonical-muscle-filters-and-custom-exercise-muscles.md) | Canonical muscle filters and custom exercise muscle mapping | Amended by 0009, 0024 |
| [0009](0009-lats-back-geometry-fallback.md) | Lats back geometry (partitioned MuscleMap sub-paths) | Accepted |
| [0010](0010-configured-hosts.md) | Configured hosts; builds stay host-agnostic | Accepted |
| [0011](0011-progression-streams-and-runs.md) | Progression reads a stream, and stalls read a run | Amended by 0031 |
| [0012](0012-catalogue-curations-and-hamstring-hinges.md) | Catalogue curations and hamstring hinges | Amended by 0025 |
| [0013](0013-tokenized-ranked-catalogue-search.md) | Tokenized and ranked catalogue search | Accepted |
| [0014](0014-routine-sync-from-active-session.md) | Routine sync from completed active session | Amended by 0015, 0029, 0030, 0031 |
| [0015](0015-exercise-notes-and-routine-sync.md) | Exercise notes in Routines, Active workouts, and Routine sync | Accepted |
| [0016](0016-session-boundary-progression-and-live-milestones.md) | Session boundary progression and live milestone cues | Amended by 0018 |
| [0017](0017-read-time-unit-normalization-for-onerm-records.md) | Read-time unit normalization for estimated 1RM and personal records | Superseded by 0031 |
| [0018](0018-milestone-cue-reads-the-prescription.md) | The Milestone cue reads the Prescription | Accepted |
| [0019](0019-read-time-unit-normalization-across-history.md) | Read-time unit normalization across training history and progression streams | Superseded by 0031 |
| [0020](0020-working-weight-is-read-from-the-log.md) | Working weight is read from the log | Amended by 0031, 0032 |
| [0021](0021-best-and-records-are-read-from-the-training-log.md) | Best and Records are read from the Training log | Superseded by 0031 |
| [0022](0022-chart-metric-and-e1rm-series-from-the-training-log.md) | The chart metric and the Estimated 1RM series are read from the Training log | Superseded by 0031 |
| [0023](0023-active-workout-behind-act-and-session-view.md) | The Active workout is one module behind `act` and `sessionView` | Superseded by 0032 |
| [0024](0024-shoulder-heads.md) | Shoulder heads: front, side and rear delts | Accepted |
| [0025](0025-movement-pattern-corrections.md) | Movement-pattern corrections to the catalogue | Accepted |
| [0026](0026-update-copies-only-what-changed.md) | `update` copies only what changed | Accepted |
| [0027](0027-admit-is-the-single-way-a-profile-comes-in.md) | `admit` is the single way a Profile comes in | Accepted |
| [0028](0028-one-rule-for-kg-and-lb.md) | One rule for kg and lb | Superseded by 0031 |
| [0029](0029-rest-duration-per-exercise.md) | An exercise may set its own Rest duration | Accepted |
| [0030](0030-routine-domain-behind-act-routine.md) | Routine domain behind `actRoutine` and `routineView` | Accepted |
| [0031](0031-the-training-log-is-the-only-reading.md) | The Training log is the only reading, in the Profile's unit | Accepted |
| [0032](0032-the-active-workout.md) | The Active workout is one module behind `act` and `sessionView` | Accepted |
| [0033](0033-double-progression-drops-below-the-range.md) | Double progression drops on a first set below the range | Accepted |
