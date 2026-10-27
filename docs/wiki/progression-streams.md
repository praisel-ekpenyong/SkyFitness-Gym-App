# Progression streams and Runs

Subsystem page for `frontend/src/lib/progression.js` and its seam in
`workout-model.js` / `active-*.js`. Vocabulary comes from `GLOSSARY.md`
(Progression stream, Run, Stall, Deload, Hit, Increment).

## How it reads history

As of `d6976cd` (the progression-runs merge, 2026-10-27), the next Prescription
derives from a **Progression stream** (the Target's shape) and its current
**Run** (trailing stretch of same-working-value sessions), not from every
historical Entry of the exercise. Full rules live in
`docs/adr/0011-progression-streams-and-runs.md` — this page points, it doesn't
restate.

Key invariants worth remembering:

- No stall counter is stored; Runs and Stalls are a pure reading of the log.
- Finished Entries persist the resolved Prescription as `plan`; Entries written
  before that field fall back to the old Target-derived reading (ADR 0011's
  legacy bullet), so imported history does not mass-deload on upgrade.
- Greyskull resets on every Miss by design, including at a Deload's new load.

## Review coverage

The 2026-10-27 two-axis review (see [reviews](reviews.md)) verified all ADR 0011
bullets have tests in `frontend/src/lib/progression-runs.test.js`, and cleaned
up the duplicated walk/scan helpers (merged `f7d5f37`, `bfb0e13`).

## Open questions

- **Manual mid-run weight change under linear** — the Run boundary keys on the
  last stored Deload, not on a working-value change, so a manually changed
  weight mid-stream gets no new baseline. Filed as
  `.scratch/progression-review/issues/05-linear-run-boundary.md`
  (`needs-triage`, 2026-10-27); the user chose to decide later.

## Known deliberate quirks

- A hand-edited zero-seconds Target can never be a Hit (`timeHit` gates on
  `goal > 0`); documented in ADR 0011 as of `6e2346f`.
- The bodyweight + double configuration ignores `repsMin` (bodyweight branch
  runs first) and Routine-level double resolves to `off` on timed exercises —
  deferred deliberately in ADR 0011, "configuration/UX clarifications".
