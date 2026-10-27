# Decision log

One entry per decision, newest first. A decision here is a settled call; the
ticket/ADR it points to carries the reasoning. Superseded entries stay listed
with a pointer to their successor.

- **2026-10-27 — Chief-of-staff wiki lives at `docs/wiki/`.** Chosen over
  `.wiki/` and top-level `wiki/` so it sits beside the other docs without
  disturbing the single-context tree in `docs/agents/domain.md`. (This page.)

- **2026-10-27 — exWeights seeding: keep the code, align the ADR.** The review
  found `buildSets` disables the `exWeights` hint for ALL routine-backed
  sessions while ADR 0011's text only specified it for a new stream's first
  session. Decision: the code is right (same-Routine history beats generic
  hints); ADR 0011's seeding bullet was rewritten to state the actual rule
  (merged `6e2346f`, ticket 01 in `.scratch/progression-review/`).

- **2026-10-27 — Linear Run boundary on manual weight change: decide later.**
  Filed as `needs-triage` ticket 05 in `.scratch/progression-review/` rather
  than fixed; it is a product-behavior call, not a bug against ADR 0011.

- **2026-10-27 — Deload threshold double 3 → 4 stands.** Review flagged the
  stricter count as beyond the commit message's intent, but ADR 0011 authored
  it and the code matches the ADR. Declined, recorded in
  `.scratch/progression-review/spec.md`.

- **2026-10-27 — Review follow-ups action as tickets, not ad-hoc edits.** The
  two-axis review's actionable findings became tickets 01–04 in
  `.scratch/progression-review/`, each implemented in its own worktree branch
  and merged one at a time (see [process](process.md)).
