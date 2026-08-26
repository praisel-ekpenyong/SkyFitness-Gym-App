// Active-workout lifecycle — the deep domain module behind active session mutations.
//
// Every Profile mutation that touches the in-progress workout, session construction,
// entry manipulation, set toggling, weight cascading, superset flow, the heaviest-ever
// weight cache (exWeights), or the finished-workout boundary crosses this seam.
// UI views become thin presentation callers.

import {
  isWarmupRow, buildSets, workoutVolume, bestWeightForEntry,
  defaultConfig, modeOf, isBw, makeRow,
  insertWarmupRow, removeRowAt, cascadeWeight
} from './workout-model.js'
import { nextPrescription, applyPrescription } from './progression.js'
import { is1RMRecord } from './onerm.js'
import { EXIDX } from './exercises.js'
import { exerciseMuscleSnapshot } from './muscles.js'
import { uid, todayISO } from './format.js'
import { t } from './i18n.js'
import {
  cleanupSg, pairAdjacent, unpairSuperset,
  supersetUnits, unitOf, setProgressHighWater, supersetFlowStep
} from './supersetFlow.js'

// --- read seam --------------------------------------------------------

/**
 * Heaviest weight the profile has ever moved for one exercise —
 * best of history plus the exWeights mirror. History already excludes
 * warm-ups/unticked sets via bestWeightForEntry; exWeights is the
 * confirmed working weight (topW) mirror.
 */
export function bestKnownWeight(S, exId) {
  if (!S || !exId) return 0
  let best = 0
  ;(S.workouts || []).forEach(w => {
    ;(w.entries || []).forEach(e => {
      if (e.id === exId) {
        const cur = bestWeightForEntry(e)
        if (cur > best) best = cur
      }
    })
  })
  const cur = S.exWeights?.[exId]?.w
  if (typeof cur === 'number' && cur > best) best = cur
  return best
}

/**
 * Heaviest *set* weight inside one entry's done work rows (warm-ups
 * excluded, unticked excluded, topW not included). Used for PR baseline.
 */
export function heaviestSetWeight(entry) {
  if (!entry || !Array.isArray(entry.sets)) return 0
  let mx = 0
  for (const s of entry.sets) {
    if (!s.done || isWarmupRow(s)) continue
    const w = Number(s.w)
    if (Number.isFinite(w) && w > mx) mx = w
  }
  return mx
}

/**
 * Heaviest weight attributable to one entry, including the confirmed
 * working weight (topW) when present. Used for exWeights merges.
 */
export function heaviestForEntry(entry) {
  const base = heaviestSetWeight(entry)
  const top = Number(entry?.topW)
  if (Number.isFinite(top) && top > base) return top
  return base
}

/**
 * Single reconciled exWeights merge policy — monotonic max.
 * Only a strictly heavier weight replaces the stored best; the date
 * stamped is the weight's own date (today for a topWeight confirmation,
 * the workout's d for a finished session). Never lowers.
 */
export function mergeExWeight(S, exId, weight, dateISO) {
  const w = Number(weight)
  if (!Number.isFinite(w) || w <= 0) return false
  if (!exId) return false
  if (!S.exWeights) S.exWeights = {}
  const cur = S.exWeights[exId]
  if (!cur || w > cur.w) {
    S.exWeights[exId] = { w: Math.round(w * 10) / 10, d: dateISO }
    return true
  }
  return false
}

// --- session construction ---------------------------------------------

/**
 * Pure builder for the active workout object. Owns target freezing,
 * prescription and set construction. Does not touch S.
 * Inject today/uid/now for tests; defaults to the real clock.
 */
export function createActiveSession(S, routineId, bw, opts = {}) {
  const _today = opts.todayISO || todayISO
  const _uid = opts.uid || uid
  const _now = opts.now || Date.now
  const routine = routineId ? (S.routines || []).find(r => r.id === routineId) : null
  const entries = (routine ? routine.ex : []).map(cfg => {
    const plan = nextPrescription(S, cfg, routine)
    const sets = applyPrescription(buildSets(S, cfg), plan)
    return { id: cfg.id, sg: cfg.sg, target: { ...cfg }, plan, sets }
  })
  return {
    id: _uid(),
    d: _today(),
    start: _now(),
    routineId: routine ? routine.id : null,
    name: routine ? routine.name : t('Freestyle'),
    bw: bw || null,
    unit: S?.unit || 'kg',
    cur: 0,
    entries,
  }
}

/**
 * Set the current active exercise index. Mutates S.active in place.
 */
export function setActiveIndex(S, idx) {
  if (!S?.active || !Array.isArray(S.active.entries)) return false
  const bounded = Math.max(0, Math.min(idx, S.active.entries.length - 1))
  S.active.cur = bounded
  return true
}

/**
 * Discard the current active session. Mutates S in place.
 */
export function discardActiveSession(S) {
  if (!S) return false
  S.active = null
  return true
}

// --- in-session exercise & set mutations -------------------------------

/**
 * Add an exercise to an active session, handling both routine progression
 * and freestyle history seeding behind one seam. Mutates S.active in place.
 */
export function addActiveExercise(S, exId, targetCfg = {}) {
  if (!S?.active) return null
  const routine = S.active.routineId ? (S.routines || []).find(r => r.id === S.active.routineId) : null
  const freestyle = !S.active.routineId
  const full = { ...defaultConfig(exId), ...targetCfg, id: exId }
  const plan = freestyle ? null : nextPrescription(S, full, routine)
  const baseSets = buildSets(S, full, freestyle ? { preferLast: true } : undefined)
  const sets = freestyle ? baseSets : applyPrescription(baseSets, plan)
  const entry = { id: exId, target: { ...targetCfg }, plan, sets }
  if (!Array.isArray(S.active.entries)) S.active.entries = []
  S.active.entries.push(entry)
  S.active.cur = S.active.entries.length - 1
  return entry
}

/**
 * Remove an exercise from an active session by index, cleaning up superset
 * groups and bounding active.cur. Mutates S.active in place.
 */
export function removeActiveExercise(S, idx) {
  if (!S?.active || !Array.isArray(S.active.entries)) return false
  if (idx < 0 || idx >= S.active.entries.length) return false
  S.active.entries.splice(idx, 1)
  cleanupSg(S.active.entries)
  if (idx < S.active.cur) S.active.cur--
  if (S.active.cur >= S.active.entries.length) {
    S.active.cur = Math.max(0, S.active.entries.length - 1)
  }
  return true
}

/**
 * Mutate a set field on an active exercise with automatic forward weight cascading.
 * Mutates S.active in place.
 */
export function updateActiveSetField(S, entryIdx, setIdx, field, value) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry || !entry.sets?.[setIdx]) return false
  if (value == null) delete entry.sets[setIdx][field]
  else entry.sets[setIdx][field] = value
  if (field === 'w') {
    entry.sets = cascadeWeight(entry.sets, setIdx, value)
  }
  return true
}

/**
 * Add a new set row to an active exercise. Mutates S.active in place.
 */
export function addActiveSet(S, entryIdx) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry) return false
  const l = entry.sets[entry.sets.length - 1] || null
  const m = modeOf({ ...(entry.target || {}), id: entry.id })
  entry.sets.push(makeRow(m, entry.target || {}, { prev: l }))
  return true
}

/**
 * Remove a set row from an active exercise (at index or the last set),
 * preserving at least one row. Mutates S.active in place.
 */
export function removeActiveSet(S, entryIdx, setIdx = null) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry || entry.sets.length <= 1) return false
  if (setIdx == null) {
    entry.sets.pop()
  } else {
    entry.sets = removeRowAt(entry.sets, setIdx)
  }
  return true
}

/**
 * Insert a warm-up row before the first work row in an active exercise.
 * Mutates S.active in place.
 */
export function addActiveWarmup(S, entryIdx) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry) return false
  const m = modeOf({ ...(entry.target || {}), id: entry.id })
  entry.sets = insertWarmupRow(entry.sets, m, entry.target || {})
  return true
}

/**
 * Pair two adjacent entries in an active session into a superset.
 */
export function pairActiveSuperset(S, firstIdx, secondIdx) {
  if (!S?.active?.entries) return false
  S.active.entries = pairAdjacent(S.active.entries, firstIdx, secondIdx)
  return true
}

/**
 * Unpair an entry from its superset partner in an active session.
 */
export function unpairActiveSuperset(S, entryIdx) {
  if (!S?.active?.entries) return false
  S.active.entries = unpairSuperset(S.active.entries, entryIdx)
  return true
}

/**
 * Toggle completion of a set in an active workout:
 * - Toggles `set.done`
 * - Determines if working weight confirmation (`topW`) is needed
 * - Evaluates if the unit or entire workout is done
 * - Updates high-water marks and executes superset navigation (`active.cur`)
 * - Returns a declarative outcome descriptor for caller side-effects (sound, timers, modals)
 */
export function toggleActiveSet(S, entryIdx, setIdx, opts = {}) {
  const A = S?.active
  const entry = A?.entries?.[entryIdx]
  if (!entry || !entry.sets?.[setIdx]) return null

  const set = entry.sets[setIdx]
  set.done = !set.done
  const checked = set.done

  const mode = modeOf({ ...(entry.target || {}), id: entry.id })
  const cardioEntry = mode === 'cardio'
  const timedEntry = mode === 'time'

  // Toggle never adds, removes or reorders entries, so the group geometry derived
  // here before the done-flag flip stays valid for every completion check below.
  const units = supersetUnits(A.entries)
  const unit = unitOf(units, entryIdx)
  const unitIdx = units.findIndex(u => u === unit)
  const isLastUnit = unitIdx >= units.length - 1
  const unitDone = unit.every(ui => (ui === entryIdx ? entry : A.entries[ui]).sets.every(x => x.done))

  let askTop = false
  let exJustDone = false
  let workoutDone = false

  if (checked) {
    if (unitDone && isLastUnit) {
      workoutDone = true
    }
    const loaded = mode === 'reps' && !(isBw({ ...(entry.target || {}), id: entry.id }) && !entry.sets.some(x => x.w > 0))
    if (entry.sets.every(x => x.done)) {
      exJustDone = true
      if (loaded && !entry.asked) {
        entry.asked = true
        askTop = true
      }
    }
  }

  // Superset flow and high-water navigation — same geometry as above; `fresh*` names
  // are kept only because the done-flag may have flipped mid-function.
  const freshUnits = units
  const freshUnit = unit
  const freshUnitIdx = unitIdx
  const freshLastUnit = isLastUnit
  const freshUnitDone = unitDone
  let newHighWater = opts.highWater
  let navigated = false
  let shouldRest = false
  let shouldStopRest = false
  let roundDone = false

  if (checked) {
    const currentHw = opts.highWater != null ? opts.highWater : 0
    const progress = setProgressHighWater(entry, currentHw)
    newHighWater = progress.highWater

    if (progress.isNew) {
      // A unit whose rows are all ticked ends any running rest timer — but only on
      // genuinely new progress, so re-checking finished work never cuts rest short.
      if (freshUnitDone) shouldStopRest = true
      if (!freshUnit || freshUnit.length <= 1) {
        if (!freshUnitDone) {
          shouldRest = true
        }
      } else {
        const step = supersetFlowStep(A.entries, freshUnit, entryIdx)
        if (step) {
          if (step.unitDone) {
            if (!freshLastUnit) {
              const nextUnit = freshUnits[freshUnitIdx + 1]
              if (!askTop && nextUnit?.length) {
                A.cur = nextUnit[0]
                navigated = true
              }
              shouldRest = true
            }
          } else {
            if (step.nextIdx != null) {
              A.cur = step.nextIdx
              navigated = true
            }
            if (step.roundDone) {
              shouldRest = true
              roundDone = true
            }
          }
        }
      }
    }
  }

  return {
    checked,
    askTop,
    workoutDone,
    exJustDone,
    cardioEntry,
    timedEntry,
    mode,
    newHighWater,
    navigated,
    shouldRest,
    shouldStopRest,
    roundDone,
    unitDone: freshUnitDone,
    cur: A.cur
  }
}

// --- in-session weight confirmation -----------------------------------

/**
 * Mutate S in place: set the confirmed working weight for one entry
 * and merge it into exWeights with today's date. Called inside
 * update(mut) so the caller still owns persistence.
 * Returns false for invalid weight or missing entry.
 */
export function applyWorkingWeight(S, entryIdx, weight, opts = {}) {
  const _today = opts.todayISO || todayISO
  const entry = S.active?.entries?.[entryIdx]
  if (!entry) return false
  const w = Math.round((Number(weight) || 0) * 10) / 10
  if (!Number.isFinite(w) || w < 0) return false
  entry.topW = w
  mergeExWeight(S, entry.id, w, _today())
  return true
}

// --- finish -----------------------------------------------------------

/**
 * Construct the persisted completed workout boundary data structure.
 * Pure function; excludes entries with no completed sets.
 */
export function buildCompletedWorkout(active, { end = Date.now(), prs = [], unit = 'kg', snapshotFor } = {}) {
  const entries = (active?.entries || []).map(entry => {
    const completed = {
      id: entry.id,
      sets: entry.sets,
      topW: entry.topW || null,
      target: entry.target || null,
    }
    const snapshot = typeof snapshotFor === 'function' ? snapshotFor(entry) : null
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) && Object.keys(snapshot).length) {
      completed.muscleSnapshot = { ...snapshot }
    }
    return completed
  }).filter(entry => (entry.sets || []).some(set => set.done))

  return {
    id: active.id,
    d: active.d,
    start: active.start,
    end,
    routineId: active.routineId,
    name: active.name,
    bw: active.bw,
    unit: active.unit || unit,
    entries,
    prs,
  }
}

/**
 * Complete the active workout: PR / e1RM detection, building the
 * persisted record, exWeights merges, and clearing active.
 * Mutates S in place (call inside update) and returns the boundary
 * data the UI needs to present the summary.
 */
export function completeActiveSession(S, opts = {}) {
  const _now = opts.now || Date.now
  const A = S.active
  if (!A) return null
  const prs = []
  const e1prs = []

  for (const e of A.entries) {
    const mxSets = heaviestSetWeight(e)
    if (mxSets > 0) {
      let bestHistory = 0
      ;(S.workouts || []).forEach(w => {
        ;(w.entries || []).forEach(en => {
          if (en.id === e.id) {
            const cur = bestWeightForEntry(en)
            if (cur > bestHistory) bestHistory = cur
          }
        })
      })
      if (mxSets > bestHistory) prs.push(e.id)
    }
    const rec = is1RMRecord(S, e.id, e)
    if (rec && !prs.includes(e.id)) e1prs.push({ id: e.id, ...rec })
  }

  const w = buildCompletedWorkout(A, {
    end: _now(),
    prs,
    unit: A.unit || S?.unit || 'kg',
    snapshotFor: en => (EXIDX[en.id]?.custom ? exerciseMuscleSnapshot(EXIDX[en.id]) : null),
  })
  w.vol = workoutVolume(w)

  for (const e of w.entries) {
    const mx = heaviestForEntry(e)
    if (mx > 0) mergeExWeight(S, e.id, mx, w.d)
  }

  S.workouts = [...(S.workouts || []), w]
  S.workouts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.start - b.start))
  S.active = null
  return { workout: w, prs, e1prs }
}

