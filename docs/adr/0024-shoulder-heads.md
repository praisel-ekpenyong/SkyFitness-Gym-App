# Shoulder heads: front, side and rear delts

Extends ADR 0008 (canonical muscle filters); geometry follows ADR 0009's lats split.

**Status:** accepted 2026-11-17. Counting live; the body map draws each head.

## Context

One "Shoulders" muscle hid the commonest volume gap. Every bench and overhead press trains the front delts; side and rear delts grow only from work aimed at them. With one deltoid, a push-heavy week read as well-trained shoulders while side and rear delts got nothing. The catalogue tags 143 exercises `delts` without naming a head, and about 450 more name a plain "shoulders" or "deltoids" helper (20 name "rear deltoids").

## Decision

- `deltoids` in the muscle map becomes `front-delts`, `side-delts` and `rear-delts` ("Front delts", "Side delts", "Rear delts"), in head-to-toe order where `deltoids` stood. The muscle map has 21 muscles.
- **Primary head.** Every delts-primary catalogue exercise names a head from a reviewed id list in `lib/shoulder-heads.js`. Name rules proposed about 112 ids (presses and front raises to front; lateral raises and upright rows to side; rear-delt raises and rows, reverse flyes to rear); the rest (rotator-cuff work, Olympic and kettlebell lifts, odd moves) and every proposal were read by hand. Cuban presses and external rotations go to rear, snatches to side, cleans and thrusters to front. No name matching happens at runtime.
- **Helper credit follows the movement.** A plain "shoulders"/"deltoids" secondary is read by the exercise's catalogue target: rows and pulls (upper back, lats) to rear, shrugs and high pulls (traps) to side, everything else (pressing, chest, arm, core work) to front. A short reviewed exception list covers pull-ups and pulldowns tagged biceps (rear) and a pullover-to-press (front). "Rear deltoids" and "rotator cuff" always read as rear.
- The rewrite runs once when the catalogue index is built, after the ADR 0012 curation overlay, so overlay removals of a plain "shoulders" still apply. The upstream dataset stays untouched.
- **Plain Shoulders is read, never migrated.** A plain Shoulders with no head (custom exercises, plan files, custom-exercise muscle snapshots on old workouts) is read at read time as front 1, side 0.4, rear 0.4 when primary, and front 0.4 when secondary. Stored data is never rewritten. Same principle as ADR 0019's read-time unit normalization.
- **Filters.** The Library and exercise-picker filters show the three heads plus a Shoulders chip that matches any head; it is a filter only, never credited. The custom-exercise muscle picker offers only the heads.
- **Drawing.** The front view draws front and side delts, the back view rear and side delts, for both body models. Side delts appear in both views and take their tab stop on the front, like other muscles drawn twice. As with the lats (ADR 0009), no new outline was drawn: the old `deltoids` shapes were partitioned.
  - Female front already shipped two shapes per shoulder. The outer cap became side delts and the inner shape front delts.
  - Male front, male back and female back had one shape per shoulder. Each was cut along a gently curved line from the top of the cap to its lower tip, the outer part becoming side delts and the inner part front (front view) or rear (back view) delts. The cut keeps the outline's own curves (split exactly with de Casteljau) and leaves a thin seam like the gaps between every other muscle.
  - `body-geometry.shoulders.test.js` holds the old shapes and checks that the heads stay inside them, never overlap, and leave only the seam. The body-paths module grew by about 1.9 KB (1.1 KB gzipped), inside the existing size budget.

## Consequences

- Lateral raises count for side delts, rear-delt work for rear delts, and bench pressing gives front delts helper credit. Fatigue, retained strength, balance and session muscle distribution all list the three heads.
- A legacy Shoulders custom spreads to all three heads; editing it in the custom-exercise picker shows the heads and saves them.
- Delt-head evidence is EMG, not growth; the assignments are a reasonable reading, not a measurement.
