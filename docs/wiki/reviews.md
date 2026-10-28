# Review archive

One entry per review event. Findings live in tickets/reports; this page records
what ran, against what, and where the findings went.

## 2026-10-28 — Two-axis review: inter-exercise rest

- **Range:** `d6e3285...HEAD` at `9eeb0fe` — "feat(active-workout): unprompted exercise transitions and workout finale boundary (ticket 02)".
- **Method:** Standards axis and Spec axis as parallel subagents (sessions `12341323-b95f-4735-8ec8-cf64fd66e2ab` and `86c17219-15b1-4ef7-9e7e-70db7485be7b`).
- **Spec source:** `.scratch/rest-between-exercises/spec.md` (tickets 01 and 02 in `.scratch/rest-between-exercises/issues/`).
- **Outcome:** Standards — 0 violations, 0 smells, clean ADR-0006 lifecycle seam adherence. Spec — all 23 User Stories verified and fully implemented, modal coordination and background timer continuity verified, workout finale suppression verified, 0 scope creep. Suite: 63/63 test files passed (869/869 tests green), build 572ms.
- **Disposition:** Spec verified accurately. Both tickets 01 and 02 resolved.

## 2026-10-27 — Two-axis review: progression-runs

- **Range:** `93e3b28...HEAD` at `d6976cd` — "Fix progression deloads with
  streams and Runs" (`627d24d`).
- **Method:** Standards axis and Spec axis as parallel subagents (sessions
  `ses_e8146fc6dffeIMqFJBfK4u6jql` and `ses_e8146fc6cffeBhK7kxg75KMxBw`).
- **Spec source:** ADR 0011 + commit message (caveat: co-authored with the
  change; no tracker ticket existed — see [process](process.md) deviations).
- **Outcome:** Standards — 5 findings, all judgement-call smells, no hard
  violations. Spec — 6 findings (1 partial, 3 scope creep, 2 suspect).
- **Disposition:** tickets 01–04 in `.scratch/progression-review/` actioned and
  merged on 2026-10-27 (`6e2346f`, `c15c798`, `f7d5f37`, `bfb0e13`; 808/808
  tests after each); ticket 05 decided and merged later the same day
  (`218877a`, 812/812); threshold change and why-message rewrites declined (see
  [decisions](decisions.md)).
- **Post-script:** the linear Run-boundary decision needed one refinement past
  the review's wording — excluding the baseline at *every* fresh stretch (not
  only at changes) would have altered sanctioned pacing. The refinement is
  recorded in ticket 05's `## Comments`.
- **Residual:** the add-time Stall contradiction (comment/glossary wording) was
  fixed in ticket 01; the code-side aim behavior was confirmed intended.
