# Stats, recovery, and post-workout distribution

Subsystem page for `frontend/src/lib/stats-selectors.js`, `lib/recovery.js`,
`lib/recovery-view.js`, `lib/strength-exercises.js`, `lib/muscles.js`, `lib/onerm.js`,
and the stats and post-workout view layer (`views/Stats.jsx`, `sheets/session.jsx`).
Vocabulary strictly follows `GLOSSARY.md` (Effective sets, Fatigue, Retained strength,
Estimated 1RM, Record, Tonnage, Muscle map).

## Subsystem Architecture

As of commit `b7f7049` (2026-10-30), the analytics and recovery system operates as
a pure functional pipeline over immutable workout history `S.workouts`:

1. **Muscle Balance & Effective Sets (`lib/muscles.js`):**
   - Training load is quantified in **Effective sets** (Primary 1.0, Secondary 0.4),
     deliberately avoiding raw tonnage comparisons across disparate movements.
   - 19 canonical drawable muscle groups in head-to-toe order (`MUSCLES`).
   - Anatomical group splitting: Back splits 3-way (lats 0.50, upper-back 0.35, lower-back 0.15, ADR 0009).
   - Custom exercises fall back to body part distributions (`BY_BODYPART`), with weights summing to 1.0.

2. **Fatigue & Stimulus Modeling (`lib/recovery.js`, `recovery-view.js`):**
   - Per-muscle stimulus calculated from performed work sets (warm-up sets strictly excluded).
   - Session intensity weighting: sets scaled by `(load / session1RM)^1.5`, dampening low-intensity volume.
   - Exponential decay with an exact 36-hour half-life (`FATIGUE_HALF_LIFE_MS = 129600000`).
   - Saturation curve $F(V) = 1 - e^{-V}$ mapping continuous volume onto $[0, 1)$ without pinning.
   - Bounded scan over 30 days (`FATIGUE_SCAN_MS = 30 * 24 * 60 * 60 * 1000` = 20 half-lives, truncation error $< 10^{-6}$).
   - Semantic bucketing: Ready ($< 0.25$), Recovering ($0.25$ to $0.50$), Fatigued ($> 0.50$).

3. **Retained Strength & Estimated 1RM (`lib/recovery.js`, `strength-exercises.js`, `onerm.js`):**
   - Dual-tier detraining model:
     - **Muscle-level** (`recovery.js: strengthOf`): Evaluated against `lastTrainedByMuscle`, preserving 1.0 retention if any compound movement recruited the muscle within 14 days.
     - **Exercise-level** (`strength-exercises.js: strengthExerciseRows`): Evaluated against `lastWorkSetAt(workouts, exId)`, capturing exercise-specific motor skill and strength decay even if the underlying muscle was worked elsewhere.
   - Retained strength curve: 14-day plateau at 1.0, followed by a 28-day half-life decay toward a floor of 0.5 (`STRENGTH_FLOOR = 0.5`).
   - Submaximal 1RM estimation via Epley ($w \cdot (1 + r/30)$), with Brzycki and Lombardi formulas available. Strictly capped at `REP_CAP = 12` reps; single reps ($r = 1$) return measured load directly without formula expansion.

4. **Stats Selectors & Pure Read Boundary (`lib/stats-selectors.js`):**
   - Pure snapshot selectors parameterized by `(S, opts)` with mandatory finite `now` timestamp (`requireNow`).
   - `selectStatsOverview`: Aggregates muscle balance, fatigue, strength, effort distributions, calendar streaks, and exercise indices.
   - `selectExerciseStats`: Derives top-set timelines, estimated 1RM progression curves, and RIR/RPE effort points for an exercise.
   - Catalogue abstraction: Seamlessly resolves built-in index (`EXDB`), user custom exercises (`S.customEx`), and historical entries carrying snapshots (`muscleSnapshot`).

## Review Findings (2026-10-30 Audit)

As audited by three parallel specialist subagents on 2026-10-30 at commit `b7f7049`:

### 1. Mathematical & Domain Vulnerabilities

- **Causal EWMA Reference Collapse**: The downward-only EWMA reference volume in `recovery.js` (`references[slug] = Math.min(references[slug], ewma)`) lacked a lower bound. Trailing light recovery or deload sessions could drive $R_k$ down from $2000\text{ kg}$ to $<150\text{ kg}$, causing subsequent standard sessions to register $>99.999\%$ extreme fatigue.
- **Future-Dated Workout Decay Bug**: Chronological traversal in `fatigueValue` decayed earlier workouts across intervals into future-dated events (`event.timestamp - lastTimestamp`), artificially slashing past valid fatigue by $>90\%$.
- **1-Rep Epley Intensity Inconsistency**: `epley1RM` in `recovery.js` computed $1 + 1/30 = 31/30$ on single reps, penalizing true 1-rep max sets by treating them as $95.2\%$ intensity ($30/31^{1.5}$) instead of $100.0\%$, violating `GLOSSARY.md` ("a real single is a measurement, not an estimate").
- **Future Age Strength Discrepancy**: For future-dated workouts ($t_{\text{workout}} > \text{now}$), `recovery.js` evaluated retained strength as 1.0 (full retention), while `strength-exercises.js` evaluated negative age as $< 0$, returning 0.5 (detrained floor).
- **Unit Incoherence in 1RM Tracking**: `onerm.js` functions (`estimate1RM`, `bestSetOf`, `e1rmSeries`, `best1RM`) were found to be completely unit-blind, comparing raw numerical values across $\text{kg}$ and $\text{lb}$ history without conversion.

### 2. UI/UX & Post-Workout Set Distribution Gaps

- **Zero Post-Workout Numerical Distribution**: Upon completing a workout, `FinishSummary` (`sheets/session.jsx`) rendered only a silent, non-interactive 2D silhouette (`<BodyMap load={loadOfWorkouts([w])} />`) without set numbers, muscle names, or exercise-to-muscle breakdowns.
- **Ephemeral Post-Workout Muscle Data**: Once `FinishSummary` was dismissed, muscle load data for that session was lost to the user: `WorkoutDetailSheet`, `views/History.jsx`, and `RecapSheet` lacked any muscle breakdown.
- **Truncated Stats Muscle Bar Chart**: `Stats.jsx` hardcoded `top = worked.slice(0, 4)`, completely concealing muscles ranked 5 through 10 unless users tapped specific vector paths on the body map.
- **Accessibility Barriers**: Non-interactive maps lacked accessible descriptions (`role="img"` without label); interactive paths announced only muscle names without load or fatigue levels; vector touch targets on small muscles (serratus, tibialis, adductors) fell below mobile standards (6–14px).

### 3. Architecture & Selector Inefficiencies

- **Monolithic Selector Coupling**: `selectStatsOverview` recalculated bodyweight, fatigue, strength, effort, and exercise indexing in a single pass. Changing a bodyweight window slider invalidated and recalculated all muscle and fatigue models.
- **Redundant Iterations & Churn**: `projectWorkouts` was invoked 3 times per overview computation; `lastTrainedByMuscle` was invoked twice; `e1rmSeries` was computed twice in `selectExerciseStats`.
- **Zustand Over-Subscription**: `Stats.jsx` subscribed to `useStore(s => s.S)`. Background active workout timer ticks triggered selector re-executions across the entire view.
- **Null Safety in Catalogue Resolution**: `resolveCatalogue` and `muscleCatalogueOf` accessed properties on `entry` without checking for null or non-object elements in `workout.entries`.

## Tactical Resolutions & Invariants

Recorded on 2026-10-30:

1. **EWMA Reference Floor**: Enforce a minimum reference floor (`FATIGUE_REF_VOLUME * 0.25` = 500 kg) in `recovery.js` to prevent deload runaway.
2. **Future-Safe Decay Interval**: In `recovery.js: fatigueValue`, clamp decay intervals to $\max(0, \min(t_i, \text{now}) - \min(t_{i-1}, \text{now}))$.
3. **1-Rep Single Passthrough in Recovery**: Update `epley1RM` in `recovery.js` to return `load` directly when `reps === 1`, aligning with `onerm.js` and `GLOSSARY.md`.
4. **Reconciled Strength Retention**: Normalize negative elapsed age in `strength-exercises.js` so future workouts clamp to 1.0 rather than dropping to 0.5.
5. **Post-Workout Set Distribution Breakdown**: In `FinishSummary` and `WorkoutDetail`, supplement `BodyMap` with a structured list of trained muscles showing effective sets, direct primary sets, and compound secondary assistance.
6. **Defensive Null Guards**: Add `if (!entry || typeof entry !== 'object') continue` to `resolveCatalogue` and `muscleCatalogueOf`.
7. **Selector Granularity**: Split `selectStatsOverview` into domain-specific selectors (`selectMuscleOverview`, `selectRecoveryOverview`, `selectEffortOverview`, `selectBodyweightOverview`).
