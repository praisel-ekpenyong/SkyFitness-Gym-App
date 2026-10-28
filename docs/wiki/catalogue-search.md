# Exercise catalogue search

Subsystem page for `frontend/src/lib/catalogue-query.js`, `frontend/src/lib/muscles.js`,
and their client consumers (`frontend/src/views/Library.jsx`, `frontend/src/sheets/catalogue.jsx`).
Vocabulary derives from `GLOSSARY.md` (Catalogue, Custom exercise, Muscle map, Effective sets).

## Architecture & Data Flow

As of commit `ef34ca0` (2026-10-28), catalogue search is an unindexed in-memory linear filter
operating over ~1,324 built-in exercises (`EXDB` in `exercises-data.js`) plus profile custom
exercises (`customEx`).

The query pipeline in `queryCatalogue` executes deterministically in five stages:

1. **Source assembly:** Profile custom exercises are prepended ahead of `EXDB` (`[...customEx, ...EXDB]`),
   ensuring custom exercises rank before built-in exercises in results.
2. **Scope & search filtering:**
   - Scope checks: `favorites` (`Set.has`), `chosen` (`usageMap` count > 0 from routine/workout history),
     `muscle` (`matchesMuscleFilter`), or `all`.
   - Keyword matching (`matchesExerciseSearch`): checks whether the normalized query string is a substring
     of any supported field (name, target muscle, canonical muscle slug/display name, secondary muscles,
     raw curations, equipment, body part, description).
3. **Dynamic equipment faceting:** Equipment chips are derived from the matching set (`equipmentOf(matching)`)
   and sorted by frequency. If an active equipment filter is absent in the new facets, it resets cleanly to `''`.
4. **Equipment filtering:** Retains only exercises matching `effectiveEquipment`.
5. **Ordering:** Preserves source insertion order, unless `scope === 'chosen'`, where results sort
   by usage count descending with alphabetical name `localeCompare` tiebreaker.

## Matching & Attribution Semantics

- **Substring matching:** As of `ef34ca0`, matching uses standard JavaScript `String.prototype.includes`.
  Queries are trimmed and lowercased (`String(query).toLowerCase().trim()`). Punctuation, hyphens, and
  interior spaces are not stripped or tokenized.
- **Canonical synonym resolution:** Colloquial abbreviations (`"delts"`, `"pecs"`, `"lats"`, `"quads"`, `"glutes"`)
  resolve through `canonicalMuscle` and match exercises targeting those groups even when the literal substring
  is absent in the exercise title.
- **Secondary muscle attribution (`secondaryMatchForQuery`):**
  - When an exercise matches solely through a secondary muscle (e.g. searching `"triceps"` surfaces Barbell Bench Press),
    `secondaryMatchForQuery` attributes the secondary slug, rendering a `<span className="tag">Secondary: {Muscle}</span>` badge.
  - Attribution is deliberately suppressed (`return null`) if the search matched the exercise's name,
    primary target, or primary canonical display name, eliminating visual badge clutter.
  - The `searchAttribution` parameter allows views to disable search badges while retaining muscle filter badges
    (utilized by `Library.jsx` in Favorites view).

## Client Integration & UX

- **Library View (`views/Library.jsx`):** Primary exploration view. Search input (`SearchField`) drives
  `q` state without debouncing, feeding `useMemo(() => queryCatalogue(...))`. Includes a "Create your own exercise"
  top row prefilled with `q.trim()` to create missing movements immediately.
- **Exercise Picker Sheet (`sheets/catalogue.jsx`):** Modal picker invoked during active workout exercise
  additions/replacements (`Workout.jsx`) and routine editing (`RoutineEdit.jsx`). Evaluates `queryCatalogue`
  synchronously per render.
- **Performance:** On Node.js v24 / V8 benchmarks (2026-10-28), unfiltered queries execute in ~1.2ms and
  full substring scans across all 1,324 items execute in ~5.4ms, comfortably within the 16.6ms (60fps)
  frame budget without requiring web workers or debounce.
- **Accessibility & Mobile:** `SearchField` supplies explicit `aria-label`, clear button semantics,
  and avoids autofocus to prevent intrusive virtual keyboard popups on mobile touch devices. Progressive
  batching renders initial slices (40 in Library, 50 in Picker) with "Show more" expansion buttons.

## Known Quirks & Limitations (recorded 2026-10-28 at `ef34ca0`)

1. **Hyphenation disparity:** Upstream dataset exercises inconsistently hyphenate compound names.
   `"push-up"` matches 39 exercises, whereas `"push up"` matches only 14. Searching `"push up"` misses the
   standard bodyweight push-up because literal `.includes()` fails across the hyphen.
2. **Equipment aliases:** Equipment search requires dataset literal strings. Searching `"bodyweight"` (one word)
   fails on exercises tagged `"body weight"` (space-separated). Equipment abbreviations like `"db"` or plural `"bands"`
   fail to match `"dumbbell"` or `"band"`.
3. **No multi-word tokenization:** Non-contiguous phrases fail to match. Searching `"dumbbell press"` fails on
   `"dumbbell incline alternate press"`. Inverted word orders (`"bench barbell"`) fail.
4. **Cross-field queries:** Combined multi-attribute queries (e.g. `"barbell chest"`) return zero results because
   no individual field contains both terms.
5. **No typo tolerance:** Substring matching strictly rejects single-character typos (e.g. `"dumnbell"`).

## Test Coverage

- `frontend/src/lib/catalogue-query.test.js`: 8 unit tests covering custom exercise search, equipment facets,
  favorite/chosen scopes, usage sorting, secondary muscle attribution, and collection safety.
- `frontend/src/lib/muscles.test.js`: 28 unit tests covering canonical aliases, primary/secondary extraction,
  filter matching, and keyword search across names, muscles, and equipment.
- `frontend/src/views/Library.test.jsx`: 9 tests verifying search input, clear button reset, favorite refinement,
  and secondary badges.
- `frontend/src/sheets/catalogue.test.jsx`: 32 tests verifying picker search, favorite toggling, and empty states.
- Verification (2026-10-28): All 77 unit and component tests passing.
