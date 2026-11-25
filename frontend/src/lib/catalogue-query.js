import { allExercises, equipmentOf } from './exercises.js'
import {
  isSecondaryMuscleMatch,
  matchesMuscleFilter,
  primaryMuscleOf,
  resolveMuscleSlug,
} from './muscles.js'
import {
  exerciseContext,
  matchesExerciseSearch,
  secondaryMatchForQuery,
  stringIncludesToken,
  tokenizeSearchQuery,
  tokenMatchesExercise,
} from './exercise-search.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Workout} Workout */
/** @typedef {import('./types.js').CustomExercise} CustomExercise */

/**
 * Score how well an exercise matches search tokens.
 * @param {CustomExercise | null | undefined} exercise
 * @param {string[] | string} tokens
 * @param {string} [rawQuery='']
 * @returns {number}
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
 * Query and rank exercises for the Library and exercise picker.
 * @param {{ profile?: Profile | null, scope?: { kind: string, muscle?: string }, search?: string, equipment?: string, searchAttribution?: boolean, ownFirst?: boolean }} [options]
 */
export function queryCatalogue({ profile, scope = { kind: 'all' }, search = '', equipment = '', searchAttribution = true, ownFirst = false } = {}) {
  /** @type {Partial<Profile>} */
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
    /** @type {Map<string, number>} */
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
    /** @param {CustomExercise} ex */
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
 * @param {CustomExercise} a
 * @param {CustomExercise} b
 * @param {Record<string, number>} usage
 * @returns {number}
 */
function compareChosenUsage(a, b, usage) {
  const usageDiff = (usage[b.id] || 0) - (usage[a.id] || 0)
  if (usageDiff !== 0) return usageDiff
  return String(a.n || '').localeCompare(String(b.n || ''))
}

// Workout usage is cached per Workouts array, so typing in the picker does not
// re-walk the log; Routines are few and counted on every call.
/** @type {WeakMap<Workout[], Record<string, number>>} */
const workoutUsageCache = new WeakMap()

/** @param {Workout[]} workouts @returns {Record<string, number>} */
function workoutUsage(workouts) {
  let usage = workoutUsageCache.get(workouts)
  if (usage) return usage
  usage = {}
  workouts.forEach(workout => {
    const entries = workout?.entries
    ;(Array.isArray(entries) ? entries : []).forEach(entry => {
      usage[entry.id] = (usage[entry.id] || 0) + 1
    })
  })
  workoutUsageCache.set(workouts, usage)
  return usage
}

/** @param {Partial<Profile>} profile @returns {Record<string, number>} */
function usageMap(profile) {
  const workouts = Array.isArray(profile.workouts) ? profile.workouts : []
  const usage = { ...workoutUsage(workouts) }
  const routines = Array.isArray(profile.routines) ? profile.routines : []
  routines.forEach(routine => {
    ;(Array.isArray(routine?.ex) ? routine.ex : []).forEach(entry => {
      if (entry.id) usage[entry.id] = (usage[entry.id] || 0) + 1
    })
  })
  return usage
}
