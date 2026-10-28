# Tokenized and ranked catalogue search

**Status:** accepted

**Context:**
The exercise catalogue previously searched exercises using strict single-string contiguous substring inclusion (`field.toLowerCase().includes(query)`). This imposed several severe limitations on lifters:
1. Multi-word queries required exact contiguous word order: searching `"dumbbell bench"` or `"incline press"` failed to match `"dumbbell incline bench press"`.
2. Hyphenation disparities in the upstream dataset caused false misses: `"push-up"` (39 exercises) and `"push up"` (14 exercises) did not match each other.
3. Cross-attribute searches like `"barbell chest"` returned 0 results because neither equipment nor muscle fields contained both terms.

**Decision:**
Replace contiguous single-string search across `catalogue-query.js` and `muscles.js` with tokenized disjunctive (OR) search governed by multi-tier relevance scoring:

1. **Tokenization and Normalization:**
   - Normalize punctuation and hyphens to whitespace (`[^\w\s]` replaced with space).
   - Lowercase and trim.
   - Filter out common conversational stop words (`with`, `on`, `in`, `for`, `the`, `to`, `at`, `and`, `or`, `a`, `an`) and 1-letter noise tokens.
2. **Cross-Attribute Token Matching:**
   - For each extracted token, an exercise matches if the token matches any of its attributes: title (`n`), equipment (`eq`), primary target muscle (`tg`, canonical slug, or display name), secondary muscles (`secondaries` or raw `smOf`), body part (`bp`), description (`desc`), or resolved canonical muscle aliases (`canonicalMuscle`).
   - An exercise is included in search results if it matches *at least one* token.
3. **Relevance Scoring and Ranking:**
   - Results are sorted deterministically by match quality:
     - `matchedTokenCount`: Exercises matching more tokens rank strictly higher (e.g. 3/3 words ahead of 2/3 words, ahead of 1/3 words).
     - `titleMatchCount`: Matches within the exercise title receive higher weight than matches in equipment or descriptions.
     - `exactPhraseBonus`: A tie-breaker bonus if the full search string appears as an exact contiguous phrase in the title.
     - Custom exercises maintain top precedence on tie breaks.
   - When browsing the `chosen` scope with an active search query, search relevance score ranks results, with history usage count acting as tie-breaker. When search is empty, pure usage count ranking is preserved.
4. **Secondary Muscle Attribution:**
   - If an exercise matched via a token corresponding to one of its secondary muscles, and that token did not match the exercise title or primary muscle, `secondaryMatchForQuery` attributes the secondary muscle badge (`Secondary: {Muscle}`).

**Consequences:**
- Lifters can search exercises flexibly in any word order (`"bench dumbbell"` surfaces *"Dumbbell Bench Press"*).
- Hyphenated exercises (`"push-up"`) are found whether typed with a space or hyphen.
- Stop-word filtration prevents descriptions containing `"on the floor"` or `"with neutral grip"` from flooding results when typing queries like `"curls with band"`.
- Multi-tier ranking ensures the most relevant exercises always appear at the top, even when matching under OR disjunction.
- Full catalogue scans across all 1,324 movements remain purely in-memory and execute within 5–8ms, preserving synchronous, debounce-free keystroke responsiveness.
