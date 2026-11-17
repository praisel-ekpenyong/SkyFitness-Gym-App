# Movement-pattern corrections to the catalogue

Extends ADR 0012 (catalogue curations).

**Status:** accepted 2026-11-17. All rows applied: `LOWER_BODY_CORRECTIONS` and `UPPER_BODY_CORRECTIONS`.

## Context

The upstream catalogue mis-tags whole movement patterns. Squats, hack squats and leg presses are glutes-primary with quads at 0.4, so twelve squat sets read as 4.8 quad sets. Calf raises credit hamstrings, leg curls credit glutes and leg extensions credit hamstrings. ADR 0012's overlay could override a primary and add secondary muscles, but it could not drop a wrong one.

## Decision

- The curation overlay (`CATALOGUE_CURATIONS`) gains `smRemove`: secondary muscles to drop, spelled as the catalogue spells them. A removed muscle is dropped from `sm` and from `mg`, through `smOf` and `mgOf` in `lib/exercises.js`. The upstream dataset stays untouched.
- Corrections are reviewed catalogue id lists per pattern in `lib/catalogue-corrections.js`. Name patterns only proposed the ids; every id was read by hand. No name matching happens at runtime. An id may be curated once; a second curation throws at load.
- Combination moves (a squat jump into a rear lunge, a lunge with a curl) and misfires (hip extensions caught by "extension", calf stretches, reverse calf raises that train the shins) are left out and keep their catalogue tags. The exclusions are listed beside the id lists.
- Shoulder heads (ADR 0024) are rewritten after the overlay runs. A removal spells the catalogue's plain `shoulders`/`deltoids`; an addition names a head the way the catalogue does, as `front deltoids`, `side deltoids` or `rear deltoids`. The overlay never names a head any other way.
- Each upper-body and core pattern applies its row in full: the primary, every listed secondary, and removal of every other secondary the reviewed ids carry. The table is read literally, so sit-ups lose hip flexors, pull-ups lose forearms and front raises keep no secondary.
- The earlier hand-written rear-delt additions on four rows (0027, 0293, 0499, 0861) moved into the row pattern.
- Two tiers only: primary 1, secondary 0.4. One primary per exercise.
- The table (★ = change from the catalogue):

| Movement | Primary (1) | Secondary (0.4) |
|---|---|---|
| Squat, hack squat, front squat | quads ★ | glutes, adductors ★ (hamstrings removed ★) |
| Leg press | quads ★ | glutes, adductors ★ |
| Lunge, split squat, step-up | quads | glutes, adductors ★ |
| Hip thrust, glute bridge | glutes | hamstrings (quads removed ★) |
| Deadlift, rack pull | glutes | hamstrings, lower back, quads ★, traps ★, forearms ★ |
| RDL, stiff-leg, good morning | hamstrings (ADR 0012) | glutes, lower back |
| Leg curl | hamstrings | calves ★ (glutes removed ★) |
| Leg extension | quads | none (hamstrings removed ★) |
| Calf raise | calves | none (hamstrings removed ★) |
| Back extension | lower back | glutes, hamstrings ★ |
| Pull-up, chin-up, pulldown | lats | upper back ★, biceps |
| Pullover | lats | chest, triceps |
| Row | upper back | lats ★, rear delts, biceps |
| Face pull, rear-delt raise, reverse fly | rear delts | upper back, traps |
| Shrug | traps | forearms ★ |
| Lateral raise | side delts | traps (triceps removed ★) |
| Upright row | side delts | traps, biceps ★ |
| Front raise | front delts | none |
| Overhead press | front delts | side delts ★, triceps |
| Bench, chest press, push-up, chest dip, incline press | chest | front delts, triceps |
| Close-grip bench, triceps dip | triceps | chest, front delts |
| Fly, crossover, pec deck | chest | front delts |
| Triceps extension, pushdown, kickback | triceps | none (shoulders removed ★) |
| Curl | biceps | forearms |
| Hammer and reverse curl | forearms | biceps |
| Crunch, sit-up | abs | obliques |
| Leg raise | abs | hip flexors |
| Twist, woodchop | obliques | abs |
| Plank, rollout | abs | obliques |

- Catalogue entries are read live, so every past workout re-reads through the corrections with no migration. Custom exercises keep the muscles the lifter picked. The stats overview now resolves catalogue records through the curated index too; before, it spread raw upstream records onto entries and skipped every curation.

## One primary per exercise, considered and kept

Kubo 2019 and Plotkin 2023 show squats grow glutes about as much as hip thrusts, an argument for two primaries. Rejected: the volume ranges follow RP's convention that a squat set is a quad set with glutes credited indirectly, and glute ranges start low for that reason. Two primaries would double-count a set and need recalibrated glute ranges with no research to calibrate against.

Reopen only if the fatigue map visibly misreads glutes after squat days, or a glute-specialisation training style is added. The fix then would be fatigue-only, not two primaries.

## Consequences

- 4 squat sets now award 4 quad sets, 1.6 glute sets and 1.6 adductor sets, and no hamstring sets.
- Filtering the Library by quads finds squats as primary matches; the exercise detail shows Quads.
- Rows now credit lats at 0.4, so the Lats filter lists them as secondary contributors.
- Hammer and reverse curls count as forearms, and twists as obliques; the Library filter follows.
- Past session distributions, fatigue, retained strength and balance shift to the corrected answer.
