import { allExercises, equipmentOf } from './exercises.js'
import {
  isSecondaryMuscleMatch,
  matchesExerciseSearch,
  matchesMuscleFilter,
  primaryMuscleOf,
  resolveMuscleSlug,
  secondaryMatchForQuery,
} from './muscles.js'

/**
 * Query the Catalogue for one browsing caller.
 *
 * This pure module owns shared selection and derived browsing facts. Callers retain
 * pagination, local selection state, translation, empty-state copy, and interactions.
 * `searchAttribution: false` opts out of search-based secondary-muscle badges while
 * keeping muscle-filter attribution (used by the Library, whose Favorites view
 * deliberately shows no search badges).
 */
export function queryCatalogue({ profile, scope = { kind: 'all' }, search = '', equipment = '', searchAttribution = true } = {}) {
  const safeProfile = profile && typeof profile === 'object' ? profile : {}
  const favoriteList = Array.isArray(safeProfile.favorites) ? safeProfile.favorites : []
  const favoriteIds = new Set(favoriteList)
  const usage = usageMap(safeProfile)
  const kind = scope?.kind || 'all'
  const muscle = scope?.kind === 'muscle' ? resolveMuscleSlug(scope.muscle) : null
  const catalogue = allExercises({ customEx: Array.isArray(safeProfile.customEx) ? safeProfile.customEx : [] })
  const matching = catalogue
    .filter(exercise => kind !== 'favorites' || favoriteIds.has(exercise.id))
    .filter(exercise => kind !== 'chosen' || usage[exercise.id])
    .filter(exercise => !muscle || matchesMuscleFilter(exercise, muscle))
    .filter(exercise => matchesExerciseSearch(exercise, search))
    .sort((a, b) => kind === 'chosen'
      ? (usage[b.id] - usage[a.id]) || String(a.n || '').localeCompare(String(b.n || ''))
      : 0)
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
