// Core state and workout history queries over state object S.
// Domain-specific operations have been migrated to their canonical deep modules:
// - Effort scales & steppers: lib/effort.js
// - Superset pairing & units: lib/supersetFlow.js
// - Set/row models & metrics: lib/workout-model.js
// - Label & time formatting:  lib/format.js

import { weekKey, isoOf } from './format.js'
import { bestWeightForEntry } from './workout-model.js'

// Local warmup predicate — duplicated from workout-model.js to avoid a circular
// import (history.js <-> workout-model.js via lastEntryFor). Keep in sync with
// phaseForSet / isWarmupRow in workout-model.js.
function isWarmupRow(set) {
  const p = set?.phase
  if (p != null && String(p).trim() !== '') {
    const token = String(p).trim().toLowerCase()
    if (token === 'warmup' || token === 'warm-up' || token === 'warm_up') return true
    if (token === 'work') return false
  }
  return set?.warmup === true
}

// Backward-compatible re-exports
export { EFFORT, stepEffort, capEffort, effortOf } from './effort.js'
export { cleanupSg, pairAdjacent, unpairSuperset, supersetUnits, unitOf } from './supersetFlow.js'
export {
  modeOf, isTimed, isBw, isPerSide, sideReps, repStep,
  defaultConfig, freestyleConfig, buildSets, workoutVolume,
  setsDone, setsDoneActive, cascadeWeight, insertWarmupRow,
  removeRowAt, workSetsDone, metricRowsForEntry, metricModeForEntry,
  bestWeightForEntry, MODES, PHASES, ROW_DEFAULTS, SETS_DEFAULTS, makeRow
} from './workout-model.js'
export { fmtSec, setLabel, exLine } from './format.js'

export function lastEntryFor(S, exId) {
  for (let i = (S?.workouts || []).length - 1; i >= 0; i--) {
    const en = (S.workouts[i].entries || []).find(e => e.id === exId)
    // `target` is what the session prescribed; finished workouts carry it so labels and the
    // progression engine can read a session back the way it was logged.
    if (!en?.sets) continue
    const workDone = en.sets.filter(s => s.done && !isWarmupRow(s))
    if (workDone.length) {
      return { d: S.workouts[i].d, sets: workDone, target: en.target || null }
    }
  }
  return null
}


export function bestWeightFor(S, exId) {
  let best = 0
  ;(S?.workouts || []).forEach(w => (w.entries || []).forEach(e => {
    if (e.id === exId) best = Math.max(best, bestWeightForEntry(e))
  }))
  return best
}

export function effectiveRoutineId(S, iso) {
  const ov = S?.dayPlan?.[iso]
  if (ov === 'rest') return null
  if (ov && (S?.routines || []).some(r => r.id === ov)) return ov
  const wd = new Date(iso + 'T12:00:00').getDay()
  return S?.week?.[wd] || null
}

export function effectiveRoutine(S, iso) {
  const id = effectiveRoutineId(S, iso)
  return id ? (S?.routines || []).find(r => r.id === id) || null : null
}

export const lastBW = S => (S?.bodyweight?.length ? S.bodyweight[S.bodyweight.length - 1] : null)

export function streakWeeks(S) {
  if (!S?.workouts?.length) return 0
  const weeks = new Set(S.workouts.map(w => weekKey(w.d)))
  let streak = 0
  const cur = new Date()
  for (let i = 0; i < 520; i++) {
    const wk = weekKey(isoOf(cur))
    if (weeks.has(wk)) streak++
    else if (i > 0) break
    cur.setDate(cur.getDate() - 7)
  }
  return streak
}
