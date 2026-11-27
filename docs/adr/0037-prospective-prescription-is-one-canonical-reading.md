# Prospective Prescription is one canonical reading

Status: Accepted, 2026-11-27.

## Context

The Milestone cue, the Progression summary and the Session boundary each built their own as-if-finished Workout to ask what Prescription a session would record: a one-entry stand-in at a fixed future date, a `session-entry-` stand-in, the real appended Workout, and the boundary's own freeze. They disagreed on date, `routineId`, unit, one entry versus all entries, and live plan versus frozen Prescription record. Ticket #193 fixed a cue that read a different rep target from the Prescription. [0016](0016-session-boundary-progression-and-live-milestones.md) requires Prescriptions to change only at the Session boundary; [0018](0018-milestone-cue-reads-the-prescription.md) requires the cue to read as if the session had just ended; [0031](0031-the-training-log-is-the-only-reading.md) requires readings from the Training log in the Profile's unit.

## Decision

**Prospective Prescription**, now a term in GLOSSARY.md, is one pure reading behind a single entry point: `readProspectivePrescription(active, profile)`. It takes the Active workout and Profile as arguments, never the store, and returns one immutable value carrying the canonical as-if-finished Workout, per-entry readings keyed for cue lookup and the same readings grouped for the summary. All entries feed every reading, so one Hit rule and one judgement serve the cue, the summary and the boundary.

The canonical Workout carries the Active workout's own date, `routineId` and unit. The Module shares the boundary's Prescription-record freeze primitive rather than constructing a second one, and leaves duration unknown mid-session instead of inventing a clock. After the Session boundary appends the real Workout, a caller whose Active workout id is already in the Training log reads that Workout instead of appending a stand-in. There is no registry, no cache and no clock argument: the reading stays in-process and deterministic.

## Considered Options

- A registrable view protocol was rejected: the dispatching rim is shallow, answer shapes are untyped, and remembering the post-append Workout becomes a caller obligation rather than a guarantee.
- A cue-first Interface with a cached reading was rejected: a cache keyed on the Training log must track in-place Set mutations, moving correctness into every mutation site instead of concentrating it.

## Consequences

- One Module, one Interface, one test surface. Hand-built Workout fixtures in tests are replaced by calls through the shared reading.
- The Module guarantees the content of the Prescription records; the Session boundary still owns writing them to the Training log.
- Recomputing the whole reading on a Set render is linear in session size. No cache is added until profiling justifies one.
