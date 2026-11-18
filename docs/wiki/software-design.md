# Software design and subsystem architecture

Subsystem page for Sky's overall software architecture, module depth, mutation seams,
domain invariants, and structural trade-offs. Vocabulary follows `GLOSSARY.md`
and `docs/architecture.md`.

## Architectural Layout

As of commit `14332f7` (2026-10-28), Sky is structured around five core architectural pillars:

1. **Active Workout Lifecycle & Operational Core (`frontend/src/lib/active-*.js`, `workout-model.js`):**
   - Deep mutation modules behind the ADR 0006 lifecycle seam (`beginSession`, `recordWorkingWeight`, `finishSession`).
   - Declarative execution in `active-toggle.js` returning pure outcome descriptors (`{ checked, mode, cur, next, rest, notice }`), keeping UI side effects decoupled from domain calculations.
   - Contiguous superset preservation (`cleanupSg`), and frozen target snapshots (`planRecord`).
2. **Domain Engine & Physiological Logic (`lib/progression.js`, `recovery.js`, `onerm.js`, `effort.js`):**
   - Pure functional computation over immutable history without persistent stall counters.
   - Progression Streams and Runs (ADR 0011) re-evaluating boundaries and stall thresholds on demand.
   - Downward-only causal EWMA reference in `recovery.js` mathematically guaranteeing monotonicity under workout deletion.
   - Rep-capped 1RM estimation (Epley/Brzycki/Lombardi capped at 12 reps, raw 1-rep passthrough) and bidirectional RIR/RPE mapping.
3. **Storage & Dual-Write Protocol (`store/useStore.js`, `lib/storage.js`, `lib/mobile.js`):**
   - Dual-write pairing of synchronous `localStorage` (`gym_state_v1`) with 800ms debounced async mirrors (IndexedDB on web, Capacitor filesystem on mobile).
   - Immediate debounce flush on `visibilitychange -> hidden` to defend against OS background kills.
   - Deterministic timestamp-based boot reconciliation (`pickNewest` comparing `_ts`) with graceful fallback to in-memory mode under storage denial (`isStorageDenied`).
4. **Catalogue & Muscle Mapping System (`lib/catalogue-query.js`, `muscles.js`, `exercises.js`):**
   - In-memory tokenized disjunctive search (ADR 0013) with conversational stop-word stripping, numeric token boundary protection, precomputed `exerciseContext(ex)`, and multi-tier relevance scoring.
   - Declarative `CATALOGUE_CURATIONS` seam (ADR 0012) layering primary target overrides (RDL/SLDL to Hamstrings) and secondary additions over pristine upstream data (`EXDB` in `exercises-data.js`).
   - Dynamic 3-way back reinterpretation (ADR 0009) reconciling historical 2-way snapshots at read-time without database migrations.
5. **View Layer & Sheet System (`views/`, `sheets/`, `components/`, `store/useUI.js`, `Modals.jsx`):**
   - Route-based navigation over 8 views decoupled from domain math.
   - Focus-trapped modal dialogs and bottom sheets in `Modals.jsx` with mobile hardware back-button synchronization (`skySheet: true` history state) and rubber-band gesture suppression.
   - Design system compliance with `DESIGN.md` (neutral surface ramps, tabular numerals, 44px tap targets, WCAG AA contrast verification).

## Module Depth Assessment (Ousterhout Standard)

As evaluated on 2026-10-28 across the codebase at commit `14332f7`:

- **Exemplary Deep Modules:**
  - `lib/active-toggle.js`: Small interface (`toggleActiveSet(S, entryIdx, setIdx)`), immense internal leverage handling warm-up segregation, high-water mark computation, superset wrapping, working-weight prompt qualification, and progress-gated rest countdowns.
  - `lib/active-finish.js`: Minimal interface (`completeActiveSession`), encapsulating Record detection for the finish summary and completed workout projection. It writes no `exWeights` or `prs` (ADR 0021).
  - `lib/catalogue-query.js`: Single pure query function (`queryCatalogue`) encapsulating scope resolution, tokenization, multi-field matching, equipment faceting, and tiered relevance scoring.
  - `lib/recovery.js`: Pure mathematical pipeline encapsulating causal EWMA normalization and exponential decay over an explicit `now` parameter.
- **Mixed Depth Modules:**
  - `lib/active-session.js`: Deep factories (`createActiveSession`, `replaceActiveExercise`) alongside shallow 3-line functions (`setActiveIndex`, `discardActiveSession`).
- **Shallow Modules & Pass-Through Bloat:**
  - `store/useStore.js`: Contains 17 three-line proxy actions delegating directly to `lib/active-workout.js`.
  - `lib/active-sets.js`: Thin wrappers (`addActiveSet`, `pairActiveSuperset`) that forward directly to `workout-model.js` and `supersetFlow.js`.
  - `sheets.jsx`: Overloaded 686-line hub maintaining residual dialogs and employing procedural late-binding injection (`configureSessionSheets`, `configureCatalogueSheets`, `bindUI`) to break circular dependencies.

2026-11-16: ADR 0023 replaced the 17 proxy actions in `store/useStore.js` with one `act(command)`, and the
ADR 0006 named actions above (`beginSession`, `finishSession`) with it. The Active workout is now read through
`sessionView`; timers and sound run as effects in `store/effects.js`.

## Known Invariant Hazards & Architectural Debt

Documented on 2026-10-28 at commit `14332f7`:

### 1. Operational Core Hazards
- **Phantom High-Water Mark (`entry.hw`):** When a completed set is deleted via `removeActiveSet(S, entryIdx)`, `entry.hw` is not clamped to the new completed count. If set 3 of 3 is removed, `hw` remains 3 while `doneWorkSets` is 2. Subsequent completions check `done > hw` (`2 > 3`), permanently suppressing inter-exercise rest and superset progression for that entry.
  - *Still open 2026-11-18 at `0820876`:* reproduced through `act`; ticket `architecture-review-2026-11/02`.
- **Orphaned Timed Holds:** On workout Discard (`views/Workout.jsx:417`) and Finish (`sheets/session.jsx:193`), `stopRest()` is called but `stopWork()` is omitted. A running timed hold continues ticking on `/home` and eventually triggers set mutation callbacks on a nullified session (`S.active === null`).
  - *Superseded 2026-11-18:* fixed. `begin`, `discard` and `finish` emit `hold:stop` (ADR 0023).
- **Timed Hold Set Surgery Shift:** Deleting warm-up rows is not disabled while a timed hold is active. Deleting an earlier warmup shifts array indices while the running timer closure retains the old index, mutating the wrong set upon completion.
  - *Superseded 2026-11-18:* fixed differently. `holdRef` pins the set by meaning, and moving Entries bumps `layout`, which cancels the hold.
- **Premature Working-Weight Mutation:** Mid-session confirmation in `applyWorkingWeight` immediately mutates `S.exWeights`. If the session is subsequently discarded, the working weight is permanently retained.
  - *Superseded 2026-11-18:* gone. `exWeights` is no longer written (ADR 0020, ADR 0021).

### 2. Domain & Storage Vulnerabilities
- **Unit-Blind History in Progression (RESOLVED - ADR 0019):** In `lib/progression.js::sessionsFor`, raw `set.w` was read without checking `workout.unit` against active `S.unit`. Resolved via unified `lib/units.js` read-time unit normalization across progression streams, workout tonnage, selectors, and working-weight caches.
- **Hardcoded Schema Key Duplication:** `RESTORE_TOP_KEYS` in `lib/storage.js` manually duplicates `Object.keys(DEF)` from `store/useStore.js`. Any new top-level configuration key added to `DEF` is silently stripped on backup restore unless manually added to `storage.js`.
  - *Still open 2026-11-18:* in sync only by hand. ADR 0027, ticket `architecture-review-2026-11/05`.
- **Shallow Preference Overlays:** `normalizeState` in `useStore.js` performs a shallow merge `{ ...base, ...raw }`, with nested spreads only for `reminder`. Any new nested preference added to `DEF` will be dropped by existing stored profiles.
- **Unsorted Workouts Array Traversal:** `sessionsFor` traverses `S.workouts` in raw array order rather than sorting by timestamp, risking incorrect stream evaluations if array ordering deviates.
  - *Partly addressed 2026-11-18:* finish and CSV import sort by different rules; restore does not sort. ADR 0027.

### 3. Client & Presentation Gaps
- **Un-memoized History Walking in `ExercisePicker`:** `sheets/catalogue.jsx` invokes `queryCatalogue` directly in the component body on every render without memoization. Inside `queryCatalogue`, `usageMap` walks the entire historical workout log on every keystroke.
  - *Still open 2026-11-18:* ticket `architecture-review-2026-11/08`.
- **Module Singleton Mutation (`EXIDX` in `exercises.js`):** `registerCustom(list)` mutates the exported `EXIDX` object in place, introducing cross-import side effects.
  - *Still open 2026-11-18:* 13 modules read `EXIDX`. Not ticketed.
- **View Layer Orchestration Leaks:** Multi-step dialog flows (`replaceActiveExerciseFlow`, `removeActiveExercise`) are exported from `views/Workout.jsx` rather than residing in sheet/store modules; stepper arithmetic is hardcoded into UI column definitions.
  - *Still open 2026-11-18:* `replaceActiveExerciseFlow` moves in ticket `architecture-review-2026-11/07`.
- **Accessibility (a11y) Deficiencies:** Sheet dialogs in `Modals.jsx` lack `aria-labelledby` targeting their heading; `#root` is not marked `inert` during open modals; and filter chips lack `aria-pressed`.
  - *Still open 2026-11-18:* ticket `architecture-review-2026-11/09`.

## Architectural Roadmap

### Tactical Track (Immediate Mitigations)
1. Clamp `entry.hw` to `doneWorkSets(entry).length` inside `removeActiveSet`.
2. Add `useUI.getState().stopWork()` to session Discard and Finish handlers.
3. Disable row deletions and additions while a timed hold is active (`holding === true`).
4. Derive `RESTORE_TOP_KEYS` dynamically from `Object.keys(DEF)`.
5. [RESOLVED - ADR 0019] Normalize weights by `workout.unit` in `progression.js::sessionsFor`, `stats-selectors.js`, and `workout-model.js` via `lib/units.js`.
6. Wrap `queryCatalogue` in `useMemo` within `sheets/catalogue.jsx` (`ExercisePicker`).
7. Add `aria-labelledby` and background `inert` trapping to `Modals.jsx`.

### Strategic Track (The Pit of Success)
1. **ESLint Boundary Rules:** Enforce that files in `views/` only export React view components, preventing domain or dialog flow functions from leaking into views.
2. **Automated Schema Parity Gate:** Add an automated unit test verifying that `storage.js`, `restore.js`, and `useStore.js` agree on all persistent keys.
3. **Disassemble `sheets.jsx`:** Break down `sheets.jsx` into domain modules (`sheets/weight.jsx`, `sheets/history.jsx`, `sheets/schedule.jsx`, `sheets/confirm.jsx`), eliminating procedural injection setters (`configureSessionSheets`, `bindUI`).
4. **Immutable Catalogue Index:** Replace mutable `EXIDX` singleton with a pure, memoized selector `selectExerciseIndex(customEx)`.
5. **Tiered Storage Architecture:** Plan migration to split `localStorage` into hot data (settings, routines, active session, 60-day history) while archiving long-term logs to IndexedDB.

## 2026-11-18 re-examination

Re-checked at `feat/week-streak@0820876` (merged to `main` as `c76f6cc`), 475 commits after the 2026-10-28 review.
Spec and tickets: `.scratch/architecture-review-2026-11/`. Claims above carry dated markers where this changed them.

- **Write cost.** `update` deep-copies the whole Profile and `save` serialises it on every change, which also
  discards the Training log's identity-keyed caches. Desktop Node, synthetic history: 400 Workouts (700 KB) about
  25 ms per Set tap; 1,000 (1.8 MB) about 68 ms. ADR 0026.
- **Profile rules inside the store.** `DEF` and `normalizeState` live in `store/useStore.js`, which touches `document`
  at import; `lib/restore.js` imports both stores. ADR 0027.
- **Import cycles.** `format` → `workout-model` → `training-log` → `effort` → `format`, and
  `useStore` → `effects` → `useUI` → `useStore`. `sheets.jsx` now needs three `configure*()` setters plus `bindUI`
  (697 lines). Ticket 07.
- **`lib/` is not pure.** 7 of 56 modules touch browser or platform APIs; `glyphs.js` imports a component. Ticket 06.
- **Smaller:** milestone cues are about half of `progression.js`; search tokenising sits in `muscles.js`; Routine
  editing has no module; `exConfigSheet` takes 8 positional arguments. Tickets 10-13, `needs-triage`.
