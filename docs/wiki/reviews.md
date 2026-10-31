# Review archive

One entry per review event. Findings live in tickets/reports; this page records
what ran, against what, and where the findings went.

## 2026-10-30 — Comprehensive review: Stats page, muscle balance, fatigue, strength, and post-workout set distribution

- **Scope:** Full audit of `views/Stats.jsx`, `lib/stats-selectors.js`, `lib/recovery.js`, `lib/recovery-view.js`, `lib/strength-exercises.js`, `lib/muscles.js`, `lib/onerm.js`, and `sheets/session.jsx` (`FinishSummary`) at commit `b7f7049`.
- **Method:** Three specialist subagents:
  - Domain & Mathematics Specialist (`f4ba96fe-fb12-41e8-a4ba-395d23a5e143`)
  - Post-Workout Distribution & UX Specialist (`63049096-93e8-4972-b8fc-fab3d3d064a5`)
  - Selectors, Architecture & Pit of Success Specialist (`27954317-5d88-47af-b749-6a195cc6f98a`)
- **Domain Docs & ADRs:** `GLOSSARY.md`, ADR 0008, ADR 0009, ADR 0011, ADR 0016.
- **Outcome:** Architectural synthesis recorded in [Stats, recovery, and post-workout distribution](stats-and-recovery.md).
  - **Domain & Math:** Identified 6 critical vulnerabilities: (1) Causal EWMA reference volume collapse ($R_k \to 133\text{ kg}$ on deloads causing $>99.999\%$ false fatigue), (2) Future-dated workout decay bug destroying past valid fatigue by $>90\%$, (3) 1-rep single Epley discrepancy ($30/31^{1.5} \approx 95.2\%$ vs $100\%$ intensity in `recovery.js`), (4) Future-dated workout strength discrepancy ($1.0$ in `recovery.js` vs $0.5$ in `strength-exercises.js`), (5) Unit-blindness in `onerm.js` corrupting PRs across $\text{kg}/\text{lb}$ entries, (6) Unscaled bodyweight intensity and dead cardio tonnage in recovery model.
  - **UX & Post-Workout Distribution:** (1) Zero numerical or list-based set distribution in `FinishSummary` (silent SVG only), (2) Ephemeral muscle data completely absent from `WorkoutDetail` and `History.jsx`, (3) Truncated top-4 bar chart in Stats Balance card concealing muscles 5+, (4) Non-interactive missed muscle chips, (5) Serious accessibility barriers: non-interactive BodyMap SVGs lack `<title>`/`aria-label`, interactive paths announce only muscle names with no load/state values, vector paths on small muscles (serratus, tibialis) have 6–14px mobile touch targets.
  - **Architecture & Selectors:** (1) Monolithic `selectStatsOverview` coupling all domains (bodyweight window change recalculates fatigue and muscle balance), (2) Redundant passes: `projectWorkouts` called 3x, `lastTrainedByMuscle` 2x, `e1rmSeries` 2x, (3) Broad `useStore(s => s.S)` subscription in `Stats.jsx` causing re-renders on active workout timer ticks, (4) P0 uncaught crash hazard: missing null guards on `entry` in `resolveCatalogue` and `muscleCatalogueOf`.
- **Disposition:** Synthesized into [Stats, recovery, and post-workout distribution](stats-and-recovery.md). Action plan formulated across immediate tactical fixes (P0 null guards, EWMA floor, future decay clamp, 1-rep Epley fix, post-workout set distribution card) and strategic environment improvements (selector decomposition, Zustand subscription slicing, unit normalization ADR, a11y labels). Full test suite: 72/72 test files passed (1,051/1,051 tests green).

## 2026-10-30 — Two-axis review: progression milestones and workout summary

- **Range:** `master...HEAD` at `9426ed3` (feat/progression-milestones).
- **Method:** Standards axis and Spec axis as parallel subagents (`6c63b22c...` and `0c9b6ab6...`).
- **Spec source:** `.scratch/progression-milestones/spec.md`, ADR 0016, and tickets 01–03.
- **Outcome:**
  - **Standards:** 1 hard violation (`getProgressionItems` training logic placed in `sheets/session.jsx` rather than `src/lib/`), 3 baseline code smells (`toTitleCase` duplication, `resolvePolicy` duplication of `policyFor`, loose data clump in `Workout.jsx`).
  - **Spec:** 3 partial/missing items (omission of pure `evaluateSessionProgression` domain seam, bodyweight calisthenics milestone cue handling, linear progression final set unlock cue), 2 scope creep items (unnecessary `.done:has(.milestone-badge)` opacity override, custom JS string capitalization), 2 implementation flaws (`0 kg → 0 kg` output on bodyweight advances, load advance awarded on unloaded bodyweight double progression).
- **Disposition:** All findings addressed in commit `8a180f1`, merged into `feat/progression-milestones` in `9426ed3`. `evaluateSessionProgression` and `sessionProgressionItems` extracted to pure `src/lib/milestones.js` seam with comprehensive Vitest tests; bodyweight rep climbs and added set targets cleanly formatted; linear final set unlocks load advances; `.capitalize` CSS applied; data clump simplified; opacity override removed. Full test suite: 72/72 test files passed (1,051/1,051 tests green).

## 2026-10-28 — Comprehensive software design review and architectural re-analysis

- **Scope:** Full application audit covering Active Workout Lifecycle, Domain Engine (Progression, Recovery, 1RM, Effort), Persistence & Dual-Write Protocol, Catalogue Query & Muscle Indexing, and View/Sheet Component Architecture at commit `14332f7`.
- **Method:** Three specialist subagents:
  - Lifecycle & Store Architecture Specialist (`ad3fdd84-62f7-46be-9731-4c9ab302fbcf`)
  - Domain Engine & Persistence Specialist (`e3762b1d-e88b-4dc6-822c-b33c825effc7`)
  - Catalogue & Client Layer Specialist (`e84f10f1-29c4-4113-a088-c1d84eaeb24f`)
- **Domain Docs & ADRs:** `docs/architecture.md`, `GLOSSARY.md`, `DESIGN.md`, ADRs 0001 through 0013.
- **Outcome:** Architectural synthesis recorded in [Software design & architecture](software-design.md).
  - **Module Depth:** Identified exemplary deep modules (`active-toggle.js`, `active-finish.js`, `catalogue-query.js`, `recovery.js`) and shallow pass-through bloat (`useStore.js` with 17 wrapper actions, `active-sets.js`, and `sheets.jsx` with procedural setter injection).
  - **Critical Hazards Identified:**
    1. *Phantom High-Water Mark (`entry.hw`)*: `removeActiveSet` fails to clamp `entry.hw` when a completed set is removed, permanently disabling inter-exercise rest and superset progression for that entry.
    2. *Orphaned Timed Holds*: Session discard and finish handlers call `stopRest()` but omit `stopWork()`, leaving ghost timers running in `useUI` over nullified sessions.
    3. *Timed Hold Set Surgery Shift*: Deleting warm-up sets during an active timed hold shifts row indices while timer callback retains captured index, mutating the wrong set upon completion.
    4. *Unit-Blind History in Progression*: `sessionsFor` does not convert `s.w` based on `workout.unit` vs `S.unit`, distorting linear progression by 2.2x or 0.45x upon unit toggle.
    5. *Hardcoded Key Duplication*: `RESTORE_TOP_KEYS` in `storage.js` manually duplicates `DEF` with no automated parity check, creating silent data-loss hazard on backup restores.
    6. *Un-memoized History Walking in `ExercisePicker`*: Direct call to `queryCatalogue` in `sheets/catalogue.jsx` re-scans the entire workout history on every keystroke.
    7. *Accessibility Gaps*: Missing `aria-labelledby` on sheet dialogs, missing `#root` `inert` trapping during open modals, and missing `aria-pressed` on filter chips.
- **Disposition:** Synthesized into [Software design & architecture](software-design.md). Tactical invariant fixes and strategic environmental guardrails formulated for execution.

## 2026-10-28 — Two-axis review: tokenized catalogue search

- **Range:** `ef34ca0...HEAD` at `75acfa2` (implementer commit `78124e6`).
- **Method:** Standards axis and Spec axis as parallel subagents (sessions `90e279e8-8e6d-4e9e-ada3-2cfb5995ca1e` and `4dd0adc6-a078-492a-831c-8728ea02453d`).
- **Spec source:** `.scratch/tokenized-ranked-search/spec.md`, ADR 0013, and ticket 01 in `.scratch/tokenized-ranked-search/issues/`.
- **Outcome:**
  - **Standards:** 1 domain vocabulary breach (`"target muscle"` / `"primary target"` in JSDoc, tests, ADR 0013, and wiki vs canonical **"primary muscle"** in `GLOSSARY.md`), 3 baseline code smells (misleading `titleMatchCount` incrementing on muscle matches, duplicated chosen usage comparator in `catalogue-query.js`, loose parameter data clump in `tokenMatchesExercise`).
  - **Spec:** 2 implementation flaws (title match bonus credited for muscle matches conflating ranking tiers; single-token exact phrase bonus improperly suppressed by `tokenList.length > 1`).
- **Disposition:** All findings addressed in ticket 02 (`.scratch/tokenized-ranked-search/issues/02-code-review-fixes.md`) via commit `26d5875`, merged into `master` in `1bf6556`. `titleMatchCount` strictly counts title matches; single-token contiguous matches receive exact phrase bonus; chosen usage comparator deduplicated; `exerciseContext(ex)` encapsulated; domain vocabulary aligned to "primary muscle". Full test suite: 64/64 test files passed (895/895 tests green).

## 2026-10-28 — Subsystem review: exercise catalogue search

- **Scope:** `frontend/src/lib/catalogue-query.js`, `muscles.js`, `exercises.js`, `views/Library.jsx`, `sheets/catalogue.jsx`, `components/ui.jsx` at commit `ef34ca0`.
- **Method:** Two parallel subagents: Domain & Algorithm Specialist (`0c28ff5a-ded9-4af6-b37c-e3d32e37a9d0`) and Search UX & Client Specialist (`54f74f57-2809-46c3-8ea6-8017876edc5d`).
- **Domain Docs & ADRs:** `GLOSSARY.md`, ADR 0008 (canonical muscle filters & custom exercise mappings), ADR 0012 (catalogue curations & hamstring hinges).
- **Outcome:** Architectural synthesis recorded in [Exercise catalogue search](catalogue-search.md). Identified 5 key search limitations/quirks (hyphenation disparity e.g. "push up" vs "push-up", missing equipment aliases e.g. "bodyweight", lack of multi-word tokenization e.g. "dumbbell press", zero cross-field searching, no typo tolerance). Confirmed linear search performance (~1.2ms idle, ~5.4ms active scan across 1,324 items) comfortably within 60fps frame budget without debounce.
- **Verification:** 36/36 unit tests passed in `catalogue-query.test.js` & `muscles.test.js` (1.50s); 41/41 component tests passed in `Library.test.jsx` & `catalogue.test.jsx` (4.47s). Full repository suite remains green.

## 2026-10-28 — Two-axis review: hamstring set distribution
- **Spec source:** `.scratch/hamstring-set-distribution/spec.md` (ticket 01).
- **Outcome:** Standards — 1 domain vocabulary violation ("primary target" vs canonical "primary muscle") and 2 baseline smells (`cur` name, duplicate test). Spec — 2 missing requirements (`EXIDX.sm` overlay population, `musclesOf` string IDs) and 1 test assertion tightness issue (`toMatchObject` vs `toEqual`).
- **Disposition:** All findings addressed in commit `858d919` (`chore(review): address standards and spec review findings for catalogue curations`), merged to `feat/hamstring-set-distribution` (`6c4f1dc`). Full suite: 64/64 test files passed (886/886 tests green). Ticket 01 resolved.

## 2026-10-28 — Code comments audit: core domain and active workout

- **Scope:** `Workout.jsx`, `workout-model.js`, `format.js`, `bodyweight.js`, `schedule.js`, and `progression.js` at commit `a56e916`.
- **Method:** Code Comments Specialist subagent (`dc9f7f0a-b012-4fcc-9664-e1276a60b6c0`) executing `/code-comments` Clean and Write workflow in isolated worktree `.worktrees/code-comments`.
- **Standards:** Ousterhout's *A Philosophy of Software Design* (chs 12, 13, 15, 16).
- **Scanner Results:**
  - `STALE_PARAM`: Reduced from 3 to 0 across the entire repository (`isPerformed`, `recordWeighIn`, `dayStatus`).
  - `MISSING_MODULE_DOC`: Resolved for `Workout.jsx`, `workout-model.js`, and `format.js`.
  - `MISSING_DOC`: Added interface docstrings for `replaceActiveExerciseFlow` and progression helpers (`inStream`, `timeAim`, `timeHit`).
  - Comment coverage: 82% → 83% across `frontend/src`.
- **Verification:** `comment_tools.py verify` confirmed 6/6 files comment-only (zero runtime changes). Full Vitest test suite: 64/64 files, 884/884 tests passed. Merged to `master` in `a56e916`.

## 2026-10-28 — Two-axis review: exercise reordering

- **Range:** `d720eb1...HEAD` at `6adf5a6` — "feat: in-session exercise reordering in active workouts".
- **Method:** Standards axis and Spec axis as parallel subagents (sessions `cedbc12d-ef4c-4589-a897-0270a20bebcd` and `b9e40a12-538a-4c62-bdef-473914cba455`).
- **Spec source:** `.scratch/exercise-reordering/spec.md` (tickets 01 and 02 in `.scratch/exercise-reordering/issues/`).
- **Outcome:** Standards — 0 hard violations, 4 judgement calls (duplicated partition logic, abbreviation `inSS`, exported sheet helper, primitive direction). Spec — 0 scope creep, 2 partial/missing items (reorder sheet close button, row keyboard accessibility), 1 cursor tracking edge case (anchoring `cur` to the moved exercise across all moves).
- **Disposition:** Actioned and resolved in `6adf5a6`. Close button added to sheet header, `aria-label` and `onKeyDown` added for keyboard navigation, `active.cur` unconditionally follows the moved exercise to `targetIdx`, and `inSS` renamed to `inSuperset`. Suite: 64/64 test files passed (884/884 tests green).

## 2026-10-28 — Catalogue review: hamstring set distribution for RDL and SLDL

- **Context:** Audit of hamstring vs glute set accounting in Romanian Deadlift (RDL) and Stiff-Leg Deadlift (SLDL) across `frontend/src/lib/exercises-data.js`, `exercises.js`, and `muscles.js` at commit `d720eb1`.
- **Findings:**
  - Effective sets follow `GLOSSARY.md` (Primary 1.0, Secondary 0.4 via `muscles.js:99`).
  - Barbell RDL (`0085`) and Dumbbell RDL (`1459`) are pinned in `EXDB` with `tg: 'glutes'`, crediting only 0.4 effective sets to hamstrings and 1.0 to glutes per performed work set.
  - SLDL exhibits implement asymmetry: Barbell Straight Leg Deadlift (`0116`) has `tg: 'hamstrings'` (1.0 sets to hamstrings), whereas Dumbbell Stiff Leg Deadlift (`0432`) has `tg: 'glutes'` (0.4 sets to hamstrings).
  - Built-in starter routine (`src/lib/starter.js:9`) compounds this: Leg Day allocates 10 effective sets to glutes and suppresses hamstrings because Squat (`0043`), Leg Press (`0739`), and RDL (`0085`) all default to primary glutes.
  - No primary target curation seam exists in `exercises.js` (only `SECONDARY_ADDITIONS` is currently supported).
- **Recommendations:**
  - Tactical: Add a primary target override for RDL (`0085`, `1459`) and dumbbell SLDL (`0432`, `0434`) so hamstrings receive 1.0 and glutes receive 0.4.
  - Strategic: Generalize `exercises.js` to support structured `CATALOGUE_OVERRIDES` (target overrides, secondary additions, and secondary removals) protected by invariant tests in `muscles.test.js`.

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
