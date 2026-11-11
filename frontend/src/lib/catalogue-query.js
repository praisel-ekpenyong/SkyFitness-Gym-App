import { allExercises, equipmentOf } from './exercises.js'
import {
  exerciseContext,
  isSecondaryMuscleMatch,
  matchesExerciseSearch,
  matchesMuscleFilter,
  primaryMuscleOf,
  resolveMuscleSlug,
  secondaryMatchForQuery,
  stringIncludesToken,
  tokenizeSearchQuery,
  tokenMatchesExercise,
} from './muscles.js'


export { tokenizeSearchQuery }

/**
 * Scores an exercise against a tokenized search query.
 *
 * Score components:
 * - Each matching token: +100
 * - Exact contiguous phrase match in exercise title: +50
 * - Each token matching the title: +10
 *
 * @param {Object} exercise - Exercise to score.
 * @param {string[]|string} tokens - Token array or raw query string.
 * @param {string} [rawQuery] - Original query string for exact phrase check.
 * @returns {number} Relevance score (0 when no match).
 */
export function scoreExerciseMatch(exercise, tokens, rawQuery = '') {
  if (!exercise) return 0
  const tokenList = [...new Set(Array.isArray(tokens) ? tokens : tokenizeSearchQuery(tokens))]
  if (!tokenList || tokenList.length === 0) return 0

  const ctx = exerciseContext(exercise)
  const titleLower = String(exercise.n || '').toLowerCase()

  let matchedTokenCount = 0
  let titleMatchCount = 0

  for (const token of tokenList) {
    const t = token.toLowerCase()
    const matchesTitle = stringIncludesToken(titleLower, t)

    if (tokenMatchesExercise(token, exercise, ctx)) {
      matchedTokenCount++
    }
    if (matchesTitle) {
      titleMatchCount++
    }
  }

  const rawLower = String(rawQuery || (typeof tokens === 'string' ? tokens : tokenList.join(' '))).trim().toLowerCase()
  const normRaw = rawLower.replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ')
  const normTitle = titleLower.replace(/[^\w\s]/g, ' ').trim().replace(/\s+/g, ' ')
  const exactPhraseBonus = (
    (rawLower.length > 0 && titleLower.includes(rawLower)) ||
    (normRaw.length > 0 && normTitle.includes(normRaw))
  ) ? 50 : 0

  return (matchedTokenCount * 100) + exactPhraseBonus + (titleMatchCount * 10)
}


/**
 * Query the Catalogue for one browsing caller.
 *
 * This pure module owns shared selection and derived browsing facts. Callers retain
 * pagination, local selection state, translation, empty-state copy, and interactions.
 * `searchAttribution: false` opts out of search-based secondary-muscle badges while
 * keeping muscle-filter attribution (used by the Library, whose Favorites view
 * deliberately shows no search badges).
 */
export function queryCatalogue({ profile, scope = { kind: 'all' }, search = '', equipment = '', searchAttribution = true, ownFirst = false } = {}) {
  const safeProfile = profile && typeof profile === 'object' ? profile : {}
  const favoriteList = Array.isArray(safeProfile.favorites) ? safeProfile.favorites : []
  const favoriteIds = new Set(favoriteList)
  const usage = usageMap(safeProfile)
  const kind = scope?.kind || 'all'
  const muscle = scope?.kind === 'muscle' ? resolveMuscleSlug(scope.muscle) : null
  const catalogue = allExercises({ customEx: Array.isArray(safeProfile.customEx) ? safeProfile.customEx : [] })
  const catalogueOrder = new Map(catalogue.map((ex, idx) => [ex.id, idx]))
  const searchTokens = tokenizeSearchQuery(search)

  const matching = catalogue
    .filter(exercise =>
      (kind !== 'favorites' || favoriteIds.has(exercise.id)) &&
      (kind !== 'chosen' || usage[exercise.id]) &&
      (!muscle || matchesMuscleFilter(exercise, muscle)) &&
      matchesExerciseSearch(exercise, search)
    )

  if (searchTokens.length > 0) {
    const scores = new Map()
    for (const ex of matching) {
      scores.set(ex.id, scoreExerciseMatch(ex, searchTokens, search))
    }
    matching.sort((a, b) => {
      const scoreDiff = (scores.get(b.id) || 0) - (scores.get(a.id) || 0)
      if (scoreDiff !== 0) return scoreDiff
      if (kind === 'chosen') {
        return compareChosenUsage(a, b, usage)
      }
      const customDiff = (b.custom ? 1 : 0) - (a.custom ? 1 : 0)
      if (customDiff !== 0) return customDiff
      return (catalogueOrder.get(a.id) || 0) - (catalogueOrder.get(b.id) || 0)
    })
  } else if (kind === 'chosen') {
    matching.sort((a, b) => compareChosenUsage(a, b, usage))
  } else if (ownFirst) {
    // Browsing without a search: the lifter's own exercises (starred, then most used) lead, so
    // the list opens on what they train rather than on whatever sorts first alphabetically.
    const rank = ex => (favoriteIds.has(ex.id) ? 1e6 : 0) + (usage[ex.id] || 0)
    matching.sort((a, b) => (rank(b) - rank(a)) || ((catalogueOrder.get(a.id) || 0) - (catalogueOrder.get(b.id) || 0)))
  }

  const equipmentOptions = equipmentOf(matching)
  const effectiveEquipment = equipmentOptions.includes(equipment) ? equipment : ''
  const selected = effectiveEquipment
    ? matching.filter(exercise => exercise.eq === effectiveEquipment)
    : matching

  return {
    rows: selected.map(exercise => ({
      exercise,
      favorite: favoriteIds.has(exercise.id),
      usageCount: usage[exercise.id] || 0,
      primaryMuscle: primaryMuscleOf(exercise),
      secondaryMatch: muscle
        ? (isSecondaryMuscleMatch(exercise, muscle) ? muscle : null)
        : (searchAttribution ? secondaryMatchForQuery(exercise, search) : null),
    })),
    catalogueCount: catalogue.length,
    equipmentOptions,
    effectiveEquipment,
    favoriteCount: favoriteList.length,
    chosenCount: Object.keys(usage).length,
  }
}

/**
 * Compares two exercises in the chosen scope by usage count descending, tie-breaking by name.
 *
 * @param {Object} a - First exercise.
 * @param {Object} b - Second exercise.
 * @param {Object} usage - Map of exercise id to usage count.
 * @returns {number}
 */
function compareChosenUsage(a, b, usage) {
  const usageDiff = (usage[b.id] || 0) - (usage[a.id] || 0)
  if (usageDiff !== 0) return usageDiff
  return String(a.n || '').localeCompare(String(b.n || ''))
}

/**
 * Count routine and workout usage per exercise id.
 *
 * @param {Object} profile - Profile with optional routines and workouts arrays; missing collections count as empty.
 * @returns {Object} Counts keyed by exercise id for ids seen at least once.
 */
function usageMap(profile) {
  const usage = {}
  const routines = Array.isArray(profile.routines) ? profile.routines : []
  const workouts = Array.isArray(profile.workouts) ? profile.workouts : []
  routines.forEach(routine => {
    ;(Array.isArray(routine?.ex) ? routine.ex : []).forEach(entry => {
      usage[entry.id] = (usage[entry.id] || 0) + 1
    })
  })
  workouts.forEach(workout => {
    ;(Array.isArray(workout?.entries) ? workout.entries : []).forEach(entry => {
      usage[entry.id] = (usage[entry.id] || 0) + 1
    })
  })
  return usage
}
