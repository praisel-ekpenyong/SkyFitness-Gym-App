# Read-time unit normalization for estimated 1RM and personal records

## Context

SkyFitness is an offline-first, single-user progressive web application with a global profile display unit preference: `S.unit = 'kg' | 'lb'`. In Settings, the app documents that *"switching units only changes the label — logged numbers are not converted"*, reflecting the intentional choice not to run destructive, irreversible data migrations across stored workout history upon a unit preference toggle.

However, treating logged set numbers as dimensionless raw floats creates severe data integrity flaws in maximal strength tracking (`lib/onerm.js`, `lib/strength-exercises.js`, and `lib/active-finish.js`):
1. **Suppression of True Personal Records**: If a lifter previously trained in pounds (logging a bench press at $150\text{ lb} \implies \text{est } 175.0$) and later trains in kilograms (bench pressing $100\text{ kg} \times 5 \implies \text{est } 116.7\text{ kg}$), comparing raw numbers without unit awareness suppresses the valid PR, because $116.7 < 175.0$ numerically, even though $100\text{ kg} = 220.5\text{ lb} > 150\text{ lb}$.
2. **Artificial Discontinuities in Trend Graphs**: Plotting raw numbers on a single timeline after a unit toggle produces an artificial $2.2\times$ or $0.45\times$ step discontinuity, corrupting progress charts and trend lines.
3. **Recovery Model Divergence**: The fatigue engine (`lib/recovery.js`) already normalizes stamped pounds to kilograms (`w * LB_TO_KG`) to compute valid biomechanical stimulus, while 1RM tracking previously remained unit-blind.

## Decision

Establish that **Estimated 1RM calculations, PR detection, and Strength retention series perform read-time unit normalization against the active profile unit (`S.unit`)**.

1. **Read-Time Unit Resolution**:
   - Stored workout history retains its original logged numbers and stamped unit metadata (`set.unit ?? entry.unit ?? workout.unit`).
   - When calculating estimated 1RMs (`estimate1RM`, `bestSetOf`, `e1rmSeries`, `best1RM`), the engine inspects the set's unit context:
     - If the set was logged in `'lb'` and the profile is currently `'kg'`, the load is scaled by `LB_TO_KG` ($0.45359237$).
     - If the set was logged in `'kg'` and the profile is currently `'lb'`, the load is scaled by $1 / \text{LB\_TO\_KG}$ ($2.20462$).
     - If the set carries no unit stamp, it defaults to the workout's stamped unit, falling back to the current profile unit.
2. **Immutable Storage Preserved**:
   - No historical workout rows or sets are mutated or rewritten when the profile unit is switched. All conversions occur purely in memory during selector and domain evaluation.
3. **Consistent Presentation**:
   - 1RM curves, all-time records, and strength rows in the Stats view always display values normalized to the current profile unit `S.unit`.
4. **Parity with Recovery Model**:
   - Unifies 1RM estimation with the recovery engine (`lib/recovery.js`), ensuring fatigue intensity weighting and 1RM progress curves evaluate identical underlying physical loads.

## Consequences

- Completely eliminates PR suppression bugs when importing multi-unit CSV files (FitNotes, Strong, Hevy) or changing unit preferences.
- Keeps progression and strength curves smooth and physically accurate across the lifetime of the profile.
- Adds lightweight unit checks during 1RM scans, fully contained within pure domain modules without touching database schemas or persistence protocols.
