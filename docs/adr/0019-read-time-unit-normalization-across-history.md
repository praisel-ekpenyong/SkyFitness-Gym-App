# Read-time unit normalization across training history and progression streams

## Context

ADR 0017 established read-time unit normalization against `S.unit` specifically for estimated 1RM calculations, PR detection, and strength retention curves (`lib/onerm.js`). 

However, set load normalization remained siloed inside `lib/onerm.js`. As a result:
1. **Progression Stream Discontinuity**: In `lib/progression.js::sessionsFor`, raw set loads (`set.w`) were evaluated without checking `workout.unit` against active `S.unit`. Toggling the profile unit between kilograms and pounds resulted in a 2.2x load jump or a 0.45x load collapse in the next session's prescription, corrupting progressive overload runs.
2. **Stats View Curve Divergence**: In `lib/stats-selectors.js::selectExerciseStats`, the "Top set" curve evaluated raw set weights (`bestWeightForEntry`) while the "Estimated 1RM" curve evaluated normalized weights, producing an artificial 2.2x step divergence on the same chart.
3. **Recovery Model Math Duplication**: The recovery engine (`lib/recovery.js`) maintained duplicate private unit math (`toKilograms`), and `bodyweight.js` served as the awkward home for the shared `LB_TO_KG` conversion constant.

## Decision

Establish a single, authoritative unit normalization seam at `frontend/src/lib/units.js` and extend **read-time unit normalization across all training history reads, progression evaluations, and workout metrics**.

1. **Dedicated Domain Seam (`lib/units.js`)**:
   - `resolveSetWeight(set, entry, workout, targetUnit)`: Canonical load resolution inspecting the unit cascade (`set.unit ?? entry?.unit ?? workout?.unit ?? targetUnit`). Converts between `'kg'` and `'lb'` using `LB_TO_KG` (0.45359237).
   - `normalizeWeight(weight, fromUnit, toUnit)`: Pure scalar conversion with 1-decimal rounding (`round1`) for cross-unit conversions.
   - Centralizes `LB_TO_KG` and case-insensitive unit token matching (`'lb'`, `'lbs'`, `'kg'`).
2. **Progression Stream Parity**:
   - `progression.js::sessionsFor` normalizes historical set loads against active profile unit `S.unit` during `readSession`.
   - Progression policies (`linear`, `double`, `greyskull`, `time`) evaluate working loads and compute increments in the active profile's unit space, ensuring progressive overload is preserved across unit toggles without artificial deload cascades.
3. **Workout Metrics & Selector Parity**:
   - `workout-model.js::bestWeightForEntry(entry, workout, targetUnit)` and `tonnageOf(workout, targetUnit)` accept unit context and evaluate normalized loads.
   - `stats-selectors.js` evaluates "Top set" metrics in the active target unit, keeping top set curves and 1RM curves strictly aligned.
4. **Immutable Storage Preserved**:
   - Historical workout logs, routine definitions, and set rows remain immutable. Stamped units are never modified; all conversions occur purely in memory at read time.

## Consequences

- Progressive overload and deload thresholds function continuously and accurately regardless of how many times a lifter toggles display units or imports multi-unit logs.
- Eliminates the 2.2x step divergence between Top Set and Estimated 1RM curves in the Stats view.
- Eliminates duplicate unit conversion functions across `recovery.js`, `onerm.js`, and `bodyweight.js`.
