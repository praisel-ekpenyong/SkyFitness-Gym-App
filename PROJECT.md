# Project: Sky Fitness Bug Audit, Defect Diagnosis, and Regression Hardening

## Architecture
Sky is an offline-first, client-only, backend-free gym & bodyweight training PWA built with React 19, Vite, Tailwind CSS, and Lucide icons.
- **Pure Training Logic (`frontend/src/lib/`)**: Mathematical progression, 1RM estimations, fatigue decay & recovery models, volume calculations, workout history manipulation, units conversion, CSV/JSON data parsers.
- **State Layer (`frontend/src/store/`)**: Zustand store (`useStore.js`) managing the single application state atom `S`, and transient UI state (`useUI.js`) managing modal sheets and timers.
- **Persistence Layer (`frontend/src/lib/storage.js`)**: Synchronous `localStorage` with a debounced trailing asynchronous `IndexedDB` mirror (and Capacitor native file mirror) stamped with `_ts`.
- **UI & Views Layer (`frontend/src/views/`, `frontend/src/sheets/`, `frontend/src/components/`)**: Mobile-first responsive screens (Home, Workout, History, Library, Plan, RoutineEdit, Settings, Stats), bottom sheets, and modal components.

## Feature Inventory
Every defect and requirement identified during Phase 0 Survey is inventoried and assigned to a milestone:

| # | Feature / Defect | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Clock-skew decay consistency | Fix `ageMs < 0` dropping strength to 0.5 floor in `strength-exercises.js` vs 1.0 in `recovery.js` | M1 | explorer_survey_1 |
| 2 | Deleted custom exercise recovery | Ensure `recovery.js` uses `entry.muscleSnapshot` when `EXIDX[id]` is missing | M1 | explorer_survey_1 |
| 3 | Multiple entries with same ID | Eliminate single-entry blindness in `onerm.js`, `strength-exercises.js`, `history.js`, `progression.js` | M1 | explorer_survey_1 |
| 4 | RIR string coercion in effort metrics | Parse numeric RIR in `effort.js:rirOf` to prevent string concatenation (`"023"`) | M1 | explorer_survey_1 |
| 5 | Empty target fallback bypass | Fix `target: {}` in freestyle entries suppressing plan fallbacks in `progression.js` | M1 | explorer_survey_1 |
| 6 | Deload inversion below 1 step | Prevent `deloadTo` from increasing weight/time when `0 < cur < step` in `progression.js` | M1 | explorer_survey_1 |
| 7 | Sort comparator contract compliance | Eliminate `NaN` and asymmetric returns in sort comparators in `active-workout.js`, `import-csv.js`, `sheets.jsx` | M1 | explorer_survey_1 |
| 8 | 1-Rep max measurement fidelity | Align 1-rep single calculation in `recovery.js:71` with `onerm.js:38` (no discounting of 1-rep single) | M1 | explorer_survey_1 |
| 9 | Duplicate PR ID prevention | Deduplicate PR IDs pushed in `active-workout.js:completeActiveSession` | M1 | explorer_survey_1 |
| 10 | Zero reps in completed sets | Prevent `recovery.js` from treating 0 reps as 1 rep | M1 | explorer_survey_1 |
| 11 | Negative/NaN volume protection | Guard against negative or NaN values in `workout-model.js:tonnageOf` | M1 | explorer_survey_1 |
| 12 | State normalization & null protection | Add `normalizeState(raw)` in `useStore.js` to prevent shallow `Object.assign` null overwrites | M2 | explorer_survey_2 |
| 13 | Backup import validation & zombie session strip | Deeply validate backup JSON, clear `fileRef`, and ensure `active: null` on restore in `Settings.jsx` | M2 | explorer_survey_2 |
| 14 | Bodyweight import null guard | Defend against `null`/undefined `S.bodyweight` in `import-csv.js:mergeImport` | M2 | explorer_survey_2 |
| 15 | Plan share bundle merge type safety | Defend against `null`/undefined `s.routines` and `s.week` in `plan-share.js:mergePlan` | M2 | explorer_survey_2 |
| 16 | Active workout custom exercise snapshot | Ensure `deleteCustomEx` preserves name and muscle snapshot on active workout entries in `catalogue.jsx` | M2 | explorer_survey_2 |
| 17 | Monotonic `exWeights` reconciliation | Implement `reconcileExWeights` on workout deletion in `active-workout.js` & `sheets.jsx` | M2 | explorer_survey_2 |
| 18 | `exWeights` dual-schema backward compatibility | Support both numeric primitives and `{ w, d }` objects in `workout-model.js`, `active-workout.js`, `catalogue.jsx` | M2 | explorer_survey_2 |
| 19 | Cross-tab storage synchronization | Add `window.addEventListener('storage')` listener in `useStore.js` to prevent multi-tab clobbering | M2 | explorer_survey_2 |
| 20 | Zero-set ghost workout prevention | Discard sessions with 0 completed sets in `completeActiveSession` instead of storing empty records | M2 | explorer_survey_2 |
| 21 | Timer lifecycle & unclamped duration guard | Clamp non-positive rest durations and clean up intervals in `useUI.js`; stabilize `useUI.test.js` | M2 | explorer_survey_2 |
| 22 | Bodyweight exercise analytics support | Support bodyweight movements (`w === 0`) in `Stats.jsx`, charting reps and displaying PRs | M3 | explorer_survey_3 |
| 23 | Unticked warm-up non-blocking flow | Ensure unticked warm-up sets do not block exercise/workout completion in `session.jsx`, `active-workout.js`, `Workout.jsx` | M3 | explorer_survey_3 |
| 24 | Calendar negative UTC timezone shift | Parse ISO dates with noon/local formatting in `sheets.jsx:Calendar` to prevent 1-month backward shift | M3 | explorer_survey_3 |
| 25 | Defensive guards on `dayPlan` and `week` | Guard direct access `S.dayPlan[...]` and `Object.keys(s.dayPlan)` in `Workout.jsx`, `sheets.jsx`, `RoutineEdit.jsx` | M3 | explorer_survey_3 |
| 26 | Sheet drag gesture exclusion for inputs | Exclude interactive inputs, textareas, and buttons from drag-to-dismiss gesture in `Modals.jsx` | M3 | explorer_survey_3 |
| 27 | In-flight work timer orphan prevention | Stop active work timer when an active timed set is removed in `Workout.jsx` and `session.jsx` | M3 | explorer_survey_3 |
| 28 | Unit-aware initial bodyweight defaults | Default to 155 lbs for imperial users and 70 kg for metric users in `sheets.jsx:87, 233` | M3 | explorer_survey_3 |
| 29 | Comprehensive Vitest suite verification | Verify all Vitest test suites pass with zero failures (`npm test`) | M4 | original_request |
| 30 | Monotonic fatigue simulation verification | Verify fatigue simulation probe passes 100% of comparisons (`npm run test:fatigue-probe`) | M4 | original_request |
| 31 | Production Vite build verification | Verify static production PWA build generates cleanly (`npm run build`) | M4 | original_request |
| 32 | Adversarial coverage hardening | Execute property-based stress tests and boundary probes via Challenger | M4 | orchestrator_plan |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Core Training Logic & Model Integrity | Pure mathematical logic in `frontend/src/lib/` (recovery, strength-exercises, onerm, progression, effort, active-workout, workout-model) | none | DONE |
| M2 | State Management, Durability & Persistence | Store slices, persistence normalization, import/export contracts, cross-tab sync (`frontend/src/store/`, `storage.js`, `plan-share.js`, `import-csv.js`) | M1 | DONE |
| M3 | Views, Sheets & UI/Logic Integration | UI flows, bodyweight stats, warm-up completion, modal gestures, timezone dates (`frontend/src/views/`, `sheets/`, `components/`) | M2 | DONE |
| M4 | Final E2E Suite, Probe Verification & Adversarial Hardening | Comprehensive test run (`npm test`), fatigue probe (`npm run test:fatigue-probe`), build (`npm run build`), adversarial stress verification | M1, M2, M3 | DONE |

## Interface Contracts
### `frontend/src/lib/` ↔ `frontend/src/store/`
- `active-workout.js`:
  - `completeActiveSession(S)`: Returns `{ workout, prs, e1prs, discarded? }`. Discards workouts with 0 completed sets. Deduplicates `prs`.
  - `reconcileExWeights(S, exId)`: Recalculates highest completed weight across all workouts in `S.workouts` and updates `S.exWeights[exId]`.
  - `mergeExWeight(S, exId, weight, dateISO)`: Monotonically records maximum weight for an exercise.
- `useStore.js`:
  - `normalizeState(raw)`: Pure function accepting any object/payload, returning a guaranteed well-formed `S` with arrays for collections and plain objects for dictionaries.
  - `update(mut)`: Pure immutable state producer pattern.
  - `replaceState(newState)`: Normalizes and replaces entire state atom, persisting immediately.

### `frontend/src/store/` ↔ `frontend/src/views/`
- Views consume `useStore(s => s.S)` and mutate exclusively via store actions (`update`, `replaceState`, `finishSession`).
- Transient UI state (modals, timer, work timer, toasts) consumed via `useUI(s => s)`.
- All view access to maps (`dayPlan`, `week`, `exWeights`) must be protected by optional chaining or default fallbacks.

## Code Layout
- `frontend/src/lib/`: Pure domain functions, algorithmic models, data parsers, unit conversions.
- `frontend/src/store/`: Zustand stores (`useStore.js`, `useUI.js`) and normalization routines.
- `frontend/src/views/`: Primary application screen components.
- `frontend/src/sheets/`: Bottom-sheet modal dialogs and slide-overs.
- `frontend/src/components/`: Reusable UI elements, charts, and gesture containers.
- `frontend/scripts/`: Verification scripts (`fatigue-monotonic-probe.mjs`).
