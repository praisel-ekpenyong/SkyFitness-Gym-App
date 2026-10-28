# Catalogue curations and hamstring hinge distribution

**Status:** resolved — `CATALOGUE_CURATIONS` seam in `exercises.js` active, RDL and SLDL variations re-targeted to primary hamstrings with secondary glutes and lower back

**Context:** 
The pinned upstream exercise catalogue (`frontend/src/lib/exercises-data.js`) broadly tagged almost all hip-hinge exercises with `tg: 'glutes'`, crediting only 0.4 effective sets to hamstrings and 1.0 to glutes per performed work set. In evidence-based strength and hypertrophy programming, the Romanian Deadlift (RDL) and Stiff-Leg Deadlift (SLDL) are programmed as premier hamstring builders capitalizing on loaded stretch at long muscle lengths. 

Furthermore, an implement asymmetry existed: Barbell Straight Leg Deadlift (`0116`) had `tg: 'hamstrings'` (1.0 sets), while Dumbbell Stiff Leg Deadlift (`0432`) had `tg: 'glutes'` (0.4 sets). 

Awarding 1.0 sets to all three muscles simultaneously ("triple counting") was rejected: biomechanically, the lower back (erector spinae) is an isometric stabilizer maintaining neutral lordosis (dynamic spinal flexion under heavy load is contraindicated), and exercise science meta-regressions (Pelland et al., *Sports Medicine* 2026) demonstrate that counting full sets for stabilizers severely overestimates volume and distorts dose-response curves.

**Implementation Resolution (2026-10-28):**

- **Centralized Curation Seam (`CATALOGUE_CURATIONS`):** In `frontend/src/lib/exercises.js`, consolidated existing row rear-delt additions (`SECONDARY_ADDITIONS`) into a unified `CATALOGUE_CURATIONS` dictionary mapping exercise IDs to primary target overrides (`tg`) and secondary additions (`smAdd`).
- **Pristine Upstream Dataset:** `frontend/src/lib/exercises-data.js` remains completely untouched and immutable.
- **Hinge Re-targeting:** Curated Barbell RDL (`0085`), Dumbbell RDL (`1459`), Dumbbell SLDL (`0432`, `0434`), Band SLDL (`1009`, `1023`), Single-Leg Deadlifts (`1756`, `1757`, `2805`), and Stiff-Leg Good Morning (`0115`) to `tg: 'hamstrings'` with `'glutes'` added to `smAdd`.
- **Transparent Indexing:** Overlays are applied when constructing `EXIDX` and in `smOf(ex)` so all consumers (`primaryMuscleOf`, `secondaryMusclesOf`, `musclesOf`, Library search, and catalogue tags) read the curated taxonomy consistently.
- **Live Reinterpretation (ADR 0009 Alignment):** Completed workout entries for standard catalogue exercises dynamically resolve through `EXIDX`, immediately updating historical volume charts and balance maps without requiring a database migration.

**Consequences:**

- 4 work sets of RDL or SLDL now award 4.0 effective sets to Hamstrings, 1.6 sets to Glutes, and 1.6 sets to Lower Back.
- Sky's default "Leg Day" starter routine awards balanced volume instead of inflating glute volume to 10 sets.
- Barbell and dumbbell stiff-leg deadlifts have identical volume accounting.
- Single-primary domain invariant (`GLOSSARY.md`) is preserved.
