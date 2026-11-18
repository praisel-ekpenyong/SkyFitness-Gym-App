import { EFFORT } from '../effort.js'
import { sortWorkouts } from './workouts.js'

function profile(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
}

function sealEffort(raw) {
  const e = raw.effort
  if (e === 'none' || EFFORT[e]) return e
  return raw.showRir ? 'rir' : 'none'
}

// Old rows carried `warmup: true`; the Profile now stores the phase shape only (ADR 0027).
function upgradeSet(set) {
  if (!profile(set) || set.warmup !== true) return set
  const { warmup, ...rest } = set
  return rest.phase == null || rest.phase === '' ? { ...rest, phase: 'warmup' } : rest
}

function upgradeSets(sets) {
  if (!Array.isArray(sets)) return sets
  let changed = false
  const upgraded = sets.map(set => {
    const next = upgradeSet(set)
    if (next !== set) changed = true
    return next
  })
  return changed ? upgraded : sets
}

function upgradeEntries(entries) {
  if (!Array.isArray(entries)) return entries
  let changed = false
  const upgraded = entries.map(entry => {
    if (!profile(entry)) return entry
    const sets = upgradeSets(entry.sets)
    if (sets === entry.sets) return entry
    changed = true
    return { ...entry, sets }
  })
  return changed ? upgraded : entries
}

function upgradeWorkout(workout) {
  if (!profile(workout)) return workout
  const entries = upgradeEntries(workout.entries)
  return entries === workout.entries ? workout : { ...workout, entries }
}

/**
 * Upgrades an incoming Profile's old shapes and puts its Workouts in Training-log order.
 * Values are never rewritten: units, `topW` and `asked` stay as stored (ADR 0019, ADR 0020).
 * @param {Object} raw - A Profile from boot, another tab, a Restore or a CSV import.
 * @returns {Object} A new Profile with the legacy `showRir` and `warmup` shapes gone.
 */
export function admit(raw) {
  if (!profile(raw)) return raw
  const rest = { ...raw, effort: sealEffort(raw) }
  delete rest.showRir
  if (Array.isArray(raw.workouts)) rest.workouts = sortWorkouts(raw.workouts.map(upgradeWorkout))
  if (profile(raw.active)) rest.active = upgradeWorkout(raw.active)
  return rest
}
