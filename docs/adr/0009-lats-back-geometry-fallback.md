# Lats back geometry (partitioned MuscleMap sub-paths)

**Status:** resolved — taxonomy live, discrete lats geometry partitioned and active for male and female back models

**Context:** Ticket 02 required a distinct `lats` SVG path pair for `male.back` and `female.back`. The 19-muscle taxonomy is live: `MUSCLES` = 19 in head-to-toe order with `lats` immediately after `upper-back`, `MUSCLE_NAME['lats']='Lats'`, `MUSCLE_TO_BODYPART['lats']='back'`, `ALIAS` `lats`/`latissimus dorsi`→`lats`, `BY_BODYPART['back']` = `{ lats:0.50, 'upper-back':0.35, 'lower-back':0.15 }`.

**Implementation Resolution (2026-08-26):**

- Discrete path partitioning: In `frontend/src/lib/body-paths.js`, the original MuscleMap back geometry shipped discrete sub-paths under `upperBack` (6 paths for male: 3 left + 3 right; 4 paths for female: 2 left + 2 right).
- The lower vertical wing paths correspond anatomically to the latissimus dorsi (`lats`), while the upper horizontal segments correspond to rhomboids/trapezius adjacent upper back (`upper-back`).
- Reassigned `male.back.p.lats` (2 paths) and `male.back.p['upper-back']` (4 paths), and `female.back.p.lats` (2 paths) and `female.back.p['upper-back']` (2 paths).
- `body-paths.test.js` updated to remove `optionalMissing` exception.
- `body-geometry.parity.test.js` un-gated and fully active: validates independent heat levels (`l4` vs `l0`), mutual exclusivity of paths (no overlap/double shading), and bundle size invariance (~90KB).

**Consequences:**

- Stats, Library, and Home muscle maps now shade `lats` and `upper-back` independently on both male and female posterior views.
- Clicking or hovering the lats section activates filter/selection for `lats` with tooltip `"Lats"`.
- Zero bundle size overhead, preserving exact pixel silhouette alignment with surrounding anatomy.

