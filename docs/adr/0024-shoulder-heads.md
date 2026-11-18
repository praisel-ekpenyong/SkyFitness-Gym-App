# Shoulder heads: front, side and rear delts

Status: Accepted, 2026-11-17. Amends [0008](0008-canonical-muscle-filters-and-custom-exercise-muscles.md); the geometry follows [0009](0009-lats-back-geometry-fallback.md).

## Decision

- `deltoids` on the Muscle map becomes `front-delts`, `side-delts` and `rear-delts`, in head-to-toe order where `deltoids` stood. The Muscle map has 21 muscles.
- **Primary head.** Every delts-primary catalogue exercise takes its head from a reviewed id list, `PRIMARY_DELT_HEAD_IDS` in `lib/shoulder-heads.js`. That list is the only owner of a primary head. No name matching happens at runtime.
- **Helper credit follows the movement.** A plain "shoulders" or "deltoids" secondary is read by the exercise's catalogue target: upper back and lats to rear, traps to side, everything else to front. A short reviewed exception list overrides that rule. "Rear deltoids" and "rotator cuff" read as rear.
- The rewrite runs once when the catalogue index is built, after the curation overlay (ADR 0012, 0025). The upstream dataset stays untouched.
- **Plain Shoulders is read, never migrated.** A Shoulders with no head on a custom exercise, a plan file or an old custom-exercise snapshot reads as front 1, side 0.4 and rear 0.4 when primary, and front 0.4 when secondary. A bodypart-only "shoulders" exercise reads like a plain Shoulders primary. Stored data is never rewritten.
- **Filters.** The Library and exercise-picker filters show the three heads, plus a Shoulders chip that matches any head. The chip is a filter only and is never credited. The custom-exercise muscle picker offers only the heads.
- **Drawing.** The front view draws front and side delts; the back view draws rear and side delts, for both body models. As with the lats (ADR 0009), the old `deltoids` shapes were partitioned and no new outline was drawn. The female front view already had two shapes per shoulder; the other views had one, cut along a curve that keeps the outline's own curves. `lib/body-geometry.shoulders.test.js` holds the old shapes and checks that the heads stay inside them and never overlap.

Why each id has its head, and why rotator-cuff work reads as rear, is written in `lib/shoulder-heads.js`.

## Consequences

- Lateral raises count for side delts, rear-delt work for rear delts, and bench pressing gives the front delts helper credit. Fatigue, Retained strength, balance and Session muscle distribution list the three heads.
- A legacy Shoulders custom exercise spreads to all three heads. Editing it shows the heads, and saving writes them only if the lifter changes the muscle selection.
- Delt-head evidence is EMG, not growth: the assignments are a reasonable reading, not a measurement.
