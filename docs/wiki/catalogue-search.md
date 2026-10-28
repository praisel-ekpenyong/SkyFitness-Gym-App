# Exercise catalogue search

Subsystem page for `frontend/src/lib/catalogue-query.js`, `frontend/src/lib/muscles.js`,
and their client consumers (`frontend/src/views/Library.jsx`, `frontend/src/sheets/catalogue.jsx`).
Vocabulary derives from `GLOSSARY.md` (Catalogue, Custom exercise, Muscle map, Effective sets, Chosen exercise).

## Architecture & Data Flow

As of commit `75acfa2` (2026-10-28, merging ADR 0013), catalogue search is an in-memory tokenized
disjunctive (OR) filter with multi-tier relevance scoring, operating over ~1,324 built-in exercises
(`EXDB` in `exercises-data.js`) plus profile custom exercises (`customEx`).

*(Historical note: At commit `ef34ca0`, search was a strict single-string contiguous substring filter.
This was superseded by ADR 0013 on 2026-10-28).*

The query pipeline in `queryCatalogue` executes deterministically in five stages:

1. **Source assembly:** Profile custom exercises are prepended ahead of `EXDB` (`[...customEx, ...EXDB]`),
   ensuring custom exercises rank before built-in exercises in results on tie-breaks.
2. **Scope & search filtering:**
   - Scope checks: `favorites` (`Set.has`), `chosen` (`usageMap` count > 0 from routine/workout history),
     `muscle` (`matchesMuscleFilter`), or `all`.
   - Tokenization & normalization (`tokenizeSearchQuery`): Strips non-alphanumeric punctuation and hyphens
     (`[^\w\s]`), converts to lowercase, removes conversational stop words (`with`, `on`, `in`, `for`,
     `the`, `to`, `at`, `and`, `or`, `a`, `an`), and removes 1-char noise tokens (preserving numeric digits).
   - Disjunctive matching (`matchesExerciseSearch`): Checks whether the exercise matches *any* extracted
     token across its title (`ex.n`), equipment (`ex.eq`), primary muscle, secondary muscles, curated
     additions (`smOf`), body part (`ex.bp`), notes/description (`ex.desc`), or canonical muscle aliases.
3. **Dynamic equipment faceting:** Equipment chips are derived from the matching set (`equipmentOf(matching)`)
   and sorted by frequency. If an active equipment filter is absent in the new facets, it resets cleanly to `''`.
4. **Equipment filtering:** Retains only exercises matching `effectiveEquipment`.
5. **Relevance scoring & ordering:**
   - When a search query is active, exercises are scored by `scoreExerciseMatch`:
     `score = (matchedTokenCount * 100) + (exactPhraseBonus ? 50 : 0) + (titleMatchCount * 10)`.
   - Results are sorted by `score` descending.
   - Tie-breaking:
     - In `chosen` scope: sorted by `score` descending, tie-breaking by `usageCount` descending, then name `localeCompare`.
     - In `all`, `favorites`, and `muscle` scopes: sorted by `score` descending, tie-breaking custom exercises first, then catalogue insertion order.
   - When search query is empty: original ordering preserved (`chosen` sorts strictly by usage count; other scopes preserve insertion order).

## Matching & Attribution Semantics

- **Cross-attribute token matching:** As of `75acfa2`, tokens can match across different fields. Searching
  `"barbell chest"` matches Barbell Bench Press because `"barbell"` matches equipment and `"chest"` matches target muscle.
- **Hyphen & punctuation normalization:** Punctuation characters (`-`, `/`, `_`) are converted to whitespace.
  Searching `"push up"` matches `"push-up"`, `"pull up"` matches `"pull-up"`, and `"3 4 sit up"` matches `"3/4 sit-up"`.
- **Numeric token safety:** Numeric tokens enforce boundary checks (`(?<!\d)${t}(?!\d)`) so searching `"4"` does
  not erroneously match `"45"`.
- **Canonical synonym resolution:** Colloquial abbreviations (`"delts"`, `"pecs"`, `"lats"`, `"quads"`, `"glutes"`)
  resolve through `canonicalMuscle` for each token individually, matching exercises targeting those muscle groups.
- **Secondary muscle attribution (`secondaryMatchForQuery`):**
  - When an exercise matches a query token corresponding to a secondary muscle, and that token did not match
    the title or primary target, `secondaryMatchForQuery` attributes the secondary slug, rendering a
    `<span className="tag">Secondary: {Muscle}</span>` badge.
  - Attribution is suppressed (`return null`) if the search term matched the exercise's title or primary muscle.
  - The `searchAttribution` toggle allows views to disable search badges (used in Library Favorites view).

## Client Integration & UX

- **Library View (`views/Library.jsx`):** Primary exploration view. Search input (`SearchField`) drives
  `q` state without debouncing, feeding `useMemo(() => queryCatalogue(...))`. Includes a "Create your own exercise"
  top row prefilled with `q.trim()` to create missing movements immediately.
- **Exercise Picker Sheet (`sheets/catalogue.jsx`):** Modal picker invoked during active workout exercise
  additions/replacements (`Workout.jsx`) and routine editing (`RoutineEdit.jsx`). Evaluates `queryCatalogue`
  synchronously per render.
- **Performance:** In-memory tokenization and relevance scoring across all 1,324 movements executes in 5–7ms,
  well within the 16.6ms (60fps) frame budget without debouncing.
- **Accessibility & Mobile:** `SearchField` supplies explicit `aria-label`, clear button semantics,
  and avoids autofocus to prevent intrusive virtual keyboard popups on mobile touch devices. Progressive
  batching renders initial slices (40 in Library, 50 in Picker) with "Show more" expansion buttons.

## Resolved & Residual Quirks (updated 2026-10-28 at `75acfa2`)

- **Resolved — Hyphenation disparity:** Searching `"push up"` now matches `"push-up"` and vice versa.
- **Resolved — Multi-word tokenization:** Searching `"bench dumbbell"` or `"dumbbell press"` now matches
  `"Dumbbell Incline Bench Press"` regardless of word order or non-contiguous position.
- **Resolved — Cross-field queries:** Combined multi-attribute queries like `"barbell chest"` now successfully match.
- **Resolved — Conversational queries:** Filler words like `"with"` in `"curls with band"` are cleanly stripped.
- **Residual — Typo tolerance:** Substring matching strictly rejects misspelled words (e.g. `"dumnbell"`). Deliberately preserved to avoid fuzzy scoring performance penalties.

## Test Coverage

- `frontend/src/lib/catalogue-query.test.js`: 12 tests covering custom exercise search, equipment facets,
  favorite/chosen scopes, relevance scoring, out-of-order/disjunctive ranking, usage tie-breaking, and attribution.
- `frontend/src/lib/muscles.test.js`: 31 tests covering canonical aliases, tokenization, stop-word filtering,
  cross-attribute matching, hyphen normalization, disjunctive OR matching, and secondary attribution.
- `frontend/src/views/Library.test.jsx`: 9 tests verifying search input, clear button reset, and badge rendering.
- `frontend/src/sheets/catalogue.test.jsx`: 32 tests verifying picker search, favorite toggling, and empty states.
- Verification (2026-10-28): All 895 tests passing across 64 test files.
