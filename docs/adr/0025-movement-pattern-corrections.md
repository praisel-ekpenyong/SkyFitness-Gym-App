# Movement-pattern corrections to the catalogue

Status: Accepted, 2026-11-17. Amends [0012](0012-catalogue-curations-and-hamstring-hinges.md).

## Decision

- The curation overlay (ADR 0012) can also drop secondary muscles (`smRemove`), spelled as the catalogue spells them. A removed muscle is dropped from `sm` and from `mg`, through `smOf` and `mgOf` in `lib/exercises.js`.
- Every reviewed curation is a catalogue id list per movement pattern in `lib/catalogue-corrections.js`. Name patterns only proposed the ids; every id was read by hand, and no name matching happens at runtime. An id may be curated once; a second curation throws when the catalogue loads.
- Combination moves and misfires keep their catalogue tags. The exclusions are listed beside the id lists.
- Each upper-body and core pattern applies its row in full: the primary, every listed secondary, and removal of every other secondary its ids carry.
- The overlay never sets a shoulder head as the primary. `PRIMARY_DELT_HEAD_IDS` in `lib/shoulder-heads.js` owns those (ADR 0024); the shoulder patterns carry only secondary changes.
- Two tiers only: the primary counts 1 effective set and each secondary 0.4. One primary per exercise.
- Catalogue exercises are read live, so every past Workout re-reads through the corrections with no migration. Built-in exercises carry no `muscleSnapshot` for that reason; custom exercises keep the muscles the lifter picked.

## One primary per exercise, considered and kept

Kubo 2019 and Plotkin 2023 show squats grow the glutes about as much as hip thrusts, an argument for two primaries. Rejected: the volume ranges follow RP's convention that a squat set is a quad set with the glutes credited indirectly, and glute ranges start low for that reason. Two primaries would double-count a set and need recalibrated glute ranges with no research to calibrate against.

Reopen only if the fatigue map visibly misreads the glutes after squat days, or a glute-specialisation Training style is added. The fix then would be in Fatigue only, not two primaries.

## Consequences

- Four squat sets credit quads 4, glutes 1.6 and adductors 1.6, and hamstrings nothing.
- Past session distributions, Fatigue, Retained strength and balance shift to the corrected answer.
