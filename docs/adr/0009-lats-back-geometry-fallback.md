# Lats back geometry fallback (no fake seam)

**Status:** fallback-documented — taxonomy ships, geometry gated until upstream provides lats

**Context:** Ticket 02 required a distinct `lats` SVG path pair for `male.back` and `female.back` sourced by re-extracting from the upstream MuscleMap Swift source (MIT, `frontend/src/lib/body-paths.js` header and `NOTICE.md`), not by hand-splitting the existing `upper-back` polygon. The 19-muscle taxonomy (ticket 01) is already live: `MUSCLES` = 19 in head-to-toe order with `lats` immediately after `upper-back`, `MUSCLE_NAME['lats']='Lats'`, `MUSCLE_TO_BODYPART['lats']='back'`, `ALIAS` `lats`/`latissimus dorsi`→`lats`, `BY_BODYPART['back']` = `{ lats:0.50, 'upper-back':0.35, 'lower-back':0.15 }`.

**Extraction attempt 2026-08-26 (within one working day):**

- Inspected MuscleMap `main` and tags `1.0.0`–`1.6.4`:
  - `Sources/MuscleMap/Data/Muscle.swift` — `Muscle` enum defines `upperBack`, `lowerBack`, `trapezius`, `rotatorCuff`, `rhomboids`, `serratus` etc., no `lats`/`latissimus` case in any release.
  - `MaleBackPaths.swift` slugs: `neck`, `trapezius`, `deltoids`, `upperBack` (3 left + 3 right), `triceps`, `lowerBack`, `forearm`, `gluteal`, `adductors`, `hamstring`, `calves`, `ankles`, `feet`, `hands`, `head`, `hair` — no `lats`.
  - `FemaleBackPaths.swift` slugs: `hair`, `neck`, `trapezius`, `deltoids`, `upperBack` (2 left + 2 right), `lowerBack`, `triceps`, `forearm`, `hands`, `gluteal`, `adductors`, `hamstring`, `calves`, `feet` — no `lats`.
  - `BodyPathData.swift` viewBoxes: `maleFront (0,95,727,1280)`, `maleBack (718,95,727,1280)`, `femaleFront (0,0,650,1450)`, `femaleBack (823,0,650,1450)`.
- Conclusion: upstream does not ship a distinct lats geometry. Hand-splitting the existing `upper-back` polygon would violate the ticket and imply a precision the artwork does not have (header notes sub-groups are dropped for this reason).

**Decision (fallback, spec-compliant):**

- No fake seam. `frontend/src/lib/body-paths.js` remains ~94KB (94285 bytes, `dist/assets/body-paths-*.js` 93.27KB), header intact, `Generated — do not hand-edit` preserved, dynamically imported via `BodyMap.jsx` `import('../lib/body-paths.js')`.
- `body-paths.test.js` gates `lats` as `optionalMissing = new Set(['lats'])` until geometry lands; `body-geometry.parity.test.js` provides the gated visual parity check (synthetic `lats:10 vs upper-back:10` → independent heat levels `l4` vs `l0` via `levelsOf`, distinct selectable back regions when path present, bundle size invariant).
- `BodyMap.jsx` already shades each slug in `MUSCLES` via `levelsOf`/`MUSCLE_NAME`/hover `<title>`/click-to-filter/selected affordance — `lats` participates identically when its path exists; until then no double-shading seam overlap occurs.
- Until true geometry lands, `lats` load is derived and ranked independently (`musclesOf`/`loadOf`/`levelsOf`/`rankOf`), and the back view temporarily shows lats stimulus via intentional secondary cross-credit (`{ lats:1.0, upper-back:0.4 }` for a lat pulldown listing `rhomboids` as secondary) and the 3-way legacy `back` fallback — no invented polygon.

**Follow-up to land geometry separately:**

- When upstream publishes a `lats` slug (or an approved MIT-licensed posterior source is available), re-run the conversion that produced `body-paths.js` (Swift `BodyPartPathData` → JSON `{"male":{"front":{"vb","p"},"back":{...}},"female":{...}}` with kebab-case slug mapping, dropping sub-groups, preserving viewBox and `INERT` conventions), add `lats` to `male.back.p` and `female.back.p` as mutually exclusive, non-overlapping paths, verify the gated parity test, and remove the `optionalMissing` gate. No schema migration needed (`tg`/`sm` already carry `lats`).

**Consequences:**

- Stats and Home muscle maps can already distinguish `lats` vs `upper-back` in derived loads and filter logic, but the posterior heat map remains a single shape until geometry lands — the imbalance signal is visible in the ranking list and secondary badges, not yet as two distinct back colours.
- No change to effective-sets weights (1.0/0.4), fatigue/strength models, or `INERT` handling.
