# Decision log

One entry per decision, newest first. A decision here is a settled call; the
ticket/ADR it points to carries the reasoning. Superseded entries stay listed
with a pointer to their successor.

- **2026-11-08 — Read-time unit normalization across training history and progression streams established.**
  Settled that read-time unit normalization against `S.unit` applies across all historical training reads, progression streams, and workout metrics behind a single authoritative seam at `src/lib/units.js`. Eliminates progressive overload step-discontinuities and deload cascades on unit preference toggles, aligns Top Set curves with Estimated 1RM curves on Stats, and unifies conversion math across recovery and progression without mutating stored history. Detailed in ADR 0019.

- **2026-11-01 — Strict canonical parameter signatures and accessible SVG labels established.**
  Settled that public domain helpers in `src/lib/` must expose single unambiguous signatures, rejecting speculative parameter sniffing or multi-type arguments (e.g. `S_or_entry`). Re-exports between presentation layers are prohibited in favor of direct imports. Interactive SVG diagrams (`BodyMap`) must provide accessible text via `getA11yLabel` announcing entity name, training state, and numerical volume. Detailed in [reviews](reviews.md).

- **2026-10-31 — Read-time unit normalization for estimated 1RM and PR tracking established.**
  Settled that estimated 1RM calculations, PR detection, and strength retention series perform read-time unit normalization against the active profile unit (`S.unit`), scaling stamped pounds to kilograms (`LB_TO_KG`) or vice versa without mutating stored history. Eliminates PR suppression and step-discontinuities on multi-unit CSV imports or unit preference toggles while maintaining static storage immutability. Detailed in ADR 0017 and [Stats, recovery, and post-workout distribution](stats-and-recovery.md).

- **2026-10-30 — Netlify production release for progression milestones verified across 4 gates and live edge policies.**
  Production build at commit `983ba9e` deployed to Netlify site `skyfitness-app` (`51d8627c-c73a-4802-be54-4fce0937cb28`, deploy ID `6ae4a460d786b64c2a8fc288`, live at `https://skyfitness-app.netlify.app`, unique deploy URL `https://6ae4a460d786b64c2a8fc288--skyfitness-app.netlify.app`). Automated pre-flight verified 72 test files (1,051 unit tests), 108,000 fatigue comparisons plus 14,858 randomized deletion checks, and 6-screen Playwright preview navigation. Live edge verified HTTP 200, strict CSP headers (`cdn.jsdelivr.net` pinned), SPA routing fallback, and immutable asset cache headers (`public, max-age=31536000, immutable`). Detailed in [deployment](deployment.md).

- **2026-10-30 — Session boundary progression and live milestone cues established.**
  Settled that progression recommendations are applied strictly at the Session boundary for the subsequent workout, evaluating all planned work sets collectively as a unified session (preserving straight-set volume and rejecting mid-session load jumping or Dynamic Double Progression). The active workout UI provides live, inline, non-intrusive milestone cues on checked-off work sets, remaining neutral on sub-target sets and reactive to edits. `FinishSummary` introduces a dedicated Progression summary section with constructive framing for deloads and volume consolidation. Specified in `.scratch/progression-milestones/` and recorded in ADR 0016.

- **2026-10-28 — Comprehensive software design review establishes tactical invariant remediation and strategic boundary roadmap.**
  Full application audit across 5 subsystems identified 7 critical state/data hazards (phantom high-water marks on set deletion, orphaned hold timers, unit-blind progression, restore key drift, unmemoized catalogue walking). Adopted two-track resolution: immediate tactical invariant patches, and strategic establishment of the 'pit of success' (ESLint boundary rules, automated schema parity tests, and sheet decomposition). Detailed in [Software design & architecture](software-design.md) and [reviews](reviews.md).

- **2026-10-28 — Tokenized and ranked catalogue search adopts disjunctive (OR) matching with multi-tier relevance scoring.**
  Replaced strict contiguous substring matching with tokenized search across `frontend/src/lib/catalogue-query.js` and `muscles.js`. Input queries are normalized (punctuation and hyphens become spaces, lowercased, trimmed) and stop words (`with`, `on`, `in`, `for`, `the`, `to`, `at`, `and`, `or`) are stripped. Tokens match cross-attribute against title, equipment, primary muscle, canonical synonyms, secondaries, body part, and descriptions. Exercises are included if they match at least one token (OR) and ranked deterministically by matched token count descending, tie-broken by title matches and exact phrase match. Detailed in ADR 0013 and [Exercise catalogue search](catalogue-search.md).

- **2026-10-28 — Netlify production release verified across 4 gates and live edge policies.**
  Production build at commit `32f391f` deployed to Netlify site `skyfitness-app` (`51d8627c-c73a-4802-be54-4fce0937cb28`, deploy ID `6ae1fba526036da1accf8409`, live at `https://skyfitness-app.netlify.app`). Automated pre-flight verified 888 unit tests, 108,000 fatigue comparisons, and 6-screen Playwright preview navigation. Live edge verified HTTP 200, strict CSP headers (`cdn.jsdelivr.net` pinned), SPA routing fallback, and no-cache policy on `/index.html`, `/sw.js`, and `/manifest.json` ensuring immediate client updates. Detailed in [deployment](deployment.md).

- **2026-10-28 — Code comments adhere to Ousterhout's 'stranger' standard with automated comment-only verification.**
  Audited core domain and view files (`Workout.jsx`, `workout-model.js`, `format.js`, `bodyweight.js`, `schedule.js`, `progression.js`). Resolved all stale `@param` references (`STALE_PARAM` count reduced to 0), added missing top-level module overview docstrings describing subsystem ownership and boundaries, and documented public interface contracts (`inStream`, `timeAim`, `timeHit`, `replaceActiveExerciseFlow`). All comment additions and cleanups are strictly verified via AST comparison (`comment_tools.py verify`) to ensure zero runtime alterations. Merged in `a56e916` (ticket 01 in `.scratch/code-comments/`).

- **2026-10-28 — In-session exercise reordering is strictly session-local, non-destructive, and adheres to positional supersets.**
  Added `moveActiveExercise(S, idx, dir)` behind the ADR 0006 lifecycle seam in `lib/active-session.js` and exposed on `useStore`. Reordering operates on individual entries, is enabled when 2 or more exercises exist and no timed hold is active, keeps performed sets intact, tracks `active.cur` to the moved exercise, and dissolves supersets via `cleanupSg` if an entry is moved past outside neighbors. UI provides a dedicated sheet with Move Up/Down chevrons, close button, and tap/keyboard jump navigation. Merged in `669a6bd` and `6adf5a6` (tickets 01 and 02 in `.scratch/exercise-reordering/`).

- **2026-10-28 — Catalogue curations re-target RDL and SLDL to Hamstrings primary with secondary Glutes.**
  Preserved the single-primary invariant (`1.0` primary, `0.4` secondary). Unified catalogue overrides into a declarative `CATALOGUE_CURATIONS` seam in `frontend/src/lib/exercises.js` (folding in `SECONDARY_ADDITIONS`) without mutating `exercises-data.js`. Re-targeted Romanian Deadlifts, Stiff-Leg Deadlifts, Single-Leg Deadlifts, and Stiff-Leg Good Mornings to Primary Hamstrings (`1.0`), explicitly injecting Glutes into secondary additions alongside Lower Back (`0.4` each). Past workouts live-reinterpret through `EXIDX` per ADR 0009 without database migration. Specified in `.scratch/hamstring-set-distribution/` and ADR 0012.

- **2026-10-28 — Inter-exercise rest is bounded by the session finale and preserves unprompted view position.**
  Completing the final set of an exercise or superset unit starts rest at `S.restSec` only when another exercise remains in the session (`isLastUnit === false`). On the workout finale (`isLastUnit === true`), rest stops and auto-rest is suppressed so the workout complete sheet presents cleanly. Eager navigation on superset unit completion was removed, ensuring unprompted exercises and supersets keep their card position with the rest countdown running until the lifter navigates manually. Merged `9eeb0fe` (tickets 01 and 02 in `.scratch/rest-between-exercises/`).

- **2026-10-28 — In-session exercise replacement is strictly session-local, preserving supersets and order.**
  Added `replaceActiveExercise` behind the ADR 0006 lifecycle seam and wired into both
  `RoutineEdit` (template editing) and `Workout` (active session). In an Active workout,
  the replacement leaves the underlying Routine untouched, warns before discarding performed sets,
  stops any running hold timer, and seeds fresh rows from the replacement's own history.
  Merged `eb9d6d6` (tickets 01–03 in `.scratch/exercise-replacement/`).

- **2026-10-27 — Chief-of-staff wiki lives at `docs/wiki/`.** Chosen over
  `.wiki/` and top-level `wiki/` so it sits beside the other docs without
  disturbing the single-context tree in `docs/agents/domain.md`. (This page.)

- **2026-10-27 — exWeights seeding: keep the code, align the ADR.** The review
  found `buildSets` disables the `exWeights` hint for ALL routine-backed
  sessions while ADR 0011's text only specified it for a new stream's first
  session. Decision: the code is right (same-Routine history beats generic
  hints); ADR 0011's seeding bullet was rewritten to state the actual rule
  (merged `6e2346f`, ticket 01 in `.scratch/progression-review/`).

- **2026-10-27 — A change of working value starts a new Run, linear included.**
  Adopted the recommendation for ticket 05: Deload, up, or the lifter's hand
  each start a new Run (baseline never a Stall), unifying linear with double
  and add-time. Merged `218877a` (4 new test scenarios; virgin stretches
  untouched). Motivation: it is what ADR 0011 and `GLOSSARY.md` already define,
  and a hand-set weight must not pile an automatic Deload on top — the cascade
  shape ADR 0011 was written to kill.

- **2026-10-27 — Deload threshold double 3 → 4 stands.** Review flagged the
  stricter count as beyond the commit message's intent, but ADR 0011 authored
  it and the code matches the ADR. Declined, recorded in
  `.scratch/progression-review/spec.md`.

- **2026-10-27 — Review follow-ups action as tickets, not ad-hoc edits.** The
  two-axis review's actionable findings became tickets 01–04 in
  `.scratch/progression-review/`, each implemented in its own worktree branch
  and merged one at a time (see [process](process.md)).
