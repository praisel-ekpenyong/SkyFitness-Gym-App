# Best and Records are read from the Training log

Best, Records, last session and Tonnage were read in about 14 files. Each one walked `S.workouts` itself and applied the unit only if it remembered to. Tonnage skipped it at all 8 call sites. Two other values were remembered outside the log: `exWeights`, a heaviest-ever cache that only goes up, and `prs`, Records stamped once at finish. As a result, the Library's Best and the Exercise detail's Best differed. A deleted typo Workout (250 kg) stayed as Best forever and stopped every later real Record from showing. Imported history never showed a Record.

Decision: one module, `lib/training-log.js`, reads all of these from the finished Workouts alone, always in `S.unit`. Every function takes the Profile first (`(S, exId)` or `(S, workout)`). There is no unit argument. Caching is internal, keyed on the `S.workouts` array.

- Best is the heaviest performed Work set in the log. Deleting a Workout takes its Best with it.
- A Record is read, never stamped. It is the moment a performed Work set beats every earlier performed Work set of the exercise, either on load or on Estimated 1RM.
  - Earlier means earlier in date-then-start order.
  - Beating means strictly heavier.
  - An exercise counts once per Workout.
  - When one Workout makes both kinds of Record, it shows as the load Record.
  - The first performed session of an exercise is a baseline, not a Record.
- New Workouts stop writing `exWeights` and `prs`, and nothing reads them anymore. Old Profiles keep both fields unread, the same way ADR 0020 left `topW` (which is still read). `mergeExWeight` and `heaviestForEntry` are deleted. Where ADR 0011 used the all-time `exWeights` hint, it now uses Best.

## Considered options

- **Keep `exWeights` as the Best and make the Library read it.** Rejected: a typo or a deleted Workout would stay as Best forever.
- **Keep stamping `prs` and re-stamp all of history whenever a Workout is deleted or imported.** Rejected: it is a second copy of what the log already says, and it has to be rebuilt every time the log changes.

## Consequences

- Logging a brand-new exercise no longer shows a trophy.
- Imported history shows Records.
- Deleting a Workout changes which later Sets read as Records.

Amends ADR 0006, 0011 and 0020.

2026-11-16 amendment: the chart metric and the Estimated 1RM series are read here too. Best and the chart metric stay two readings. See ADR 0022.
