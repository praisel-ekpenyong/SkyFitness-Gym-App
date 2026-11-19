# Catalogue curations and hamstring hinges

Status: Accepted, 2026-10-28. Amended by [0025](0025-movement-pattern-corrections.md): curations can also remove secondary muscles, and every curation, these rows included, is a pattern id list.

## Decision

- The pinned upstream catalogue (`lib/exercises-data.js`) is never edited. Sky corrects it with an overlay of reviewed curations keyed by catalogue id, which can override the primary target (`tg`) and add secondary muscles (`smAdd`).
- The overlay is applied when the catalogue index (`EXIDX` in `lib/exercises.js`) is built and in `smOf`, so every reader of an exercise's muscles sees the curated ones.
- Catalogue exercises are read live through the index, so past Workouts re-read through a curation with no migration.
- The first curation: the Romanian deadlift, stiff-leg deadlift and stiff-leg good morning family is hamstrings-primary, with glutes and lower back as secondaries. Four sets credit hamstrings 4, glutes 1.6 and lower back 1.6. A full set to all three was rejected, because the lower back only stabilises a hinge.
- One primary per exercise (`GLOSSARY.md`).

Why each id is on its list, and which near-misses were left out, is written beside the lists in `lib/catalogue-corrections.js`.
