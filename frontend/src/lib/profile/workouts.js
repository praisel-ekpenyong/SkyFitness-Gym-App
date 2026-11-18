function startOf(workout) {
  const start = Number(workout?.start)
  return Number.isFinite(start) ? start : 0
}

/** The one Workout order: date, then start, then original position. */
function compareWorkouts(a, b) {
  const da = String(a?.d ?? '')
  const db = String(b?.d ?? '')
  if (da < db) return -1
  if (da > db) return 1
  return startOf(a) - startOf(b)
}

/**
 * Sorts Workouts into the Training log's one order without mutating the input.
 * @param {Array|*} workouts - Finished Workouts of any shape.
 * @returns {Array} A new array ordered by date, then start, then original position.
 */
export function sortWorkouts(workouts) {
  if (!Array.isArray(workouts)) return []
  return workouts
    .map((workout, index) => ({ workout, index }))
    .sort((a, b) => compareWorkouts(a.workout, b.workout) || a.index - b.index)
    .map(entry => entry.workout)
}
