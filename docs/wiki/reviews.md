# Review archive

One entry per review event. Findings live in tickets/reports; this page records
what ran, against what, and where the findings went.

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
