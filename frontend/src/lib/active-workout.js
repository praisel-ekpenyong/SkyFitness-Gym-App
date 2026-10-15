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
  supersetUnits, unitOf, setProgressHighWater, supersetFlowStep, hasWork, isExerciseDone
} from './supersetFlow.js'

// --- read seam --------------------------------------------------------

/**
 * Highest training load recorded for an exercise across history and working-weight cache.
 *
 * Queries all completed workout entries (excluding warm-up rows and unperformed sets via `bestWeightForEntry`)
 * and compares against the confirmed working-weight mirror (`S.exWeights[exId].w`).
 *
 * @param {Object} S - Application state atom containing `workouts` and `exWeights`.
 * @param {string} exId - Exercise identifier from EXIDX.
 * @returns {number} Heaviest load in active units (kg/lb), or 0 if unrecorded.
 */
export function bestKnownWeight(S, exId) {
  if (!S || !exId) return 0
  let best = 0
  for (const w of S.workouts || []) {
    for (const e of w.entries || []) {
      if (e.id === exId) {
        const cur = bestWeightForEntry(e)
        if (cur > best) best = cur
      }
    }
  }
  const cur = S.exWeights?.[exId]?.w
  if (typeof cur === 'number' && cur > best) best = cur
  return best
}

/**
 * Highest load among completed work sets in a single workout entry.
 *
 * Excludes warm-up rows, uncompleted sets, and the post-exercise working weight (`topW`).
 * Used as the baseline load when evaluating personal records (PRs).
 *
 * @param {Object} entry - Active or historical workout entry containing `{ sets }`.
 * @returns {number} Maximum completed set load in active units, or 0 if none.
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
 * Peak load attributable to an entry, evaluating both completed work sets and post-exercise confirmation.
 *
 * Evaluates the maximum of `heaviestSetWeight(entry)` and the confirmed working load (`entry.topW`).
 * Used when updating the all-time working-weight cache (`exWeights`).
 *
 * @param {Object} entry - Completed or active workout entry.
 * @returns {number} Highest recorded load in active units, or 0 if none.
 */
export function heaviestForEntry(entry) {
  const base = heaviestSetWeight(entry)
  const top = Number(entry?.topW)
  if (Number.isFinite(top) && top > base) return top
  return base
}

/**
 * Update the all-time working-weight cache (`exWeights`) under a monotonic maximum policy.
 *
 * Only a strictly greater load overwrites the stored record; ties and lower loads are rejected.
 * The stamped date reflects the source event (today's date for in-session confirmation, or workout
 * completion date `d` for historical logs). Never lowers stored weight. Mutates `S.exWeights` in-place.
 *
 * @param {Object} S - Application state atom containing `exWeights`.
 * @param {string} exId - Target exercise identifier.
 * @param {number} weight - Candidate load in active units.
 * @param {string} dateISO - ISO calendar date ('YYYY-MM-DD') associated with the load.
 * @returns {boolean} True if the stored weight was updated, false if rejected or unchanged.
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
 * Construct a fresh active workout session object from a routine or as freestyle.
 *
 * Pure factory function: initializes targets, derives progression prescriptions, and generates
 * initial set rows without mutating state atom `S`.
 *
 * @param {Object} S - Application state atom containing routines and preferences.
 * @param {string|null} routineId - ID of routine to instantiate, or null for a freestyle workout.
 * @param {number|null} [bw=null] - Current body weight at workout start (in active units).
 * @param {Object} [opts] - Injectable clock and ID generators for deterministic testing.
 * @param {() => string} [opts.todayISO] - Calendar date supplier ('YYYY-MM-DD').
 * @param {() => string} [opts.uid] - Unique session identifier generator.
 * @param {() => number} [opts.now] - Epoch millisecond timestamp supplier.
 * @returns {Object} Active workout session object (`S.active`).
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
 * Set the index of the currently viewed exercise in the active session.
 *
 * Mutates `S.active.cur` in-place, clamping `idx` to valid entry bounds `[0, entries.length - 1]`.
 *
 * @param {Object} S - Application state atom.
 * @param {number} idx - Target exercise index.
 * @returns {boolean} True if index was successfully set; false if no active session exists.
 */
export function setActiveIndex(S, idx) {
  if (!S?.active || !Array.isArray(S.active.entries)) return false
  const bounded = Math.max(0, Math.min(idx, S.active.entries.length - 1))
  S.active.cur = bounded
  return true
}

/**
 * Abort and clear the current active workout session.
 *
 * Mutates `S.active` to null in-place, discarding all in-progress sets.
 *
 * @param {Object} S - Application state atom.
 * @returns {boolean} True if state was mutated, false if `S` was null.
 */
export function discardActiveSession(S) {
  if (!S) return false
  S.active = null
  return true
}

// --- in-session exercise & set mutations -------------------------------

/**
 * Append an exercise entry to the active workout session.
 *
 * For routine-backed workouts, applies progression prescriptions; for freestyle workouts,
 * seeds targets from historical performance (`preferLast: true`). Clamps active index `cur`
 * to the new entry. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {string} exId - Exercise identifier from EXIDX.
 * @param {Object} [targetCfg={}] - Target configuration overrides (sets, reps, weight, progression).
 * @returns {Object|null} The newly created entry, or null if no active workout exists.
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
 * Remove an exercise from an active workout session by index.
 *
 * Deletes the entry, prunes orphaned superset IDs via `cleanupSg`, and bounds `active.cur`
 * to the remaining entries. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} idx - 0-based index of the entry to remove.
 * @returns {boolean} True if entry was removed, false if index is out of bounds or no active session.
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
 * Update a single property on a set row, with automatic forward weight cascading.
 *
 * When updating load (`field === 'w'`), changes cascade forward to subsequent uncompleted
 * work sets in the entry via `cascadeWeight`. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of target exercise entry.
 * @param {number} setIdx - Index of set row within entry.
 * @param {string} field - Property key to modify (e.g., 'w', 'r', 'sec', 'rpe').
 * @param {*} value - New value to assign; `null` or `undefined` deletes the property.
 * @returns {boolean} True if mutation succeeded, false if entry or set was not found.
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
 * Append a new work set row to an active exercise entry.
 *
 * Clones target properties and defaults from the preceding row. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of target exercise entry.
 * @returns {boolean} True if set was appended, false if entry was not found.
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
 * Remove a set row from an active exercise entry while preserving at least one row.
 *
 * If `setIdx` is omitted, pops the last set. Will not remove the last remaining set in an entry.
 * Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of target exercise entry.
 * @param {number|null} [setIdx=null] - Index of specific set to remove; null removes trailing set.
 * @returns {boolean} True if set was removed, false if entry is missing or only 1 set remains.
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
 * Insert a warm-up row before the first work row in an active exercise entry.
 *
 * Warm-up rows are marked with `warmup: true` and excluded from volume calculations, PR checks,
 * and completion judgments. Mutates `S.active` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of target exercise entry.
 * @returns {boolean} True if warm-up row was inserted, false if entry was not found.
 */
export function addActiveWarmup(S, entryIdx) {
  const entry = S?.active?.entries?.[entryIdx]
  if (!entry) return false
  const m = modeOf({ ...(entry.target || {}), id: entry.id })
  entry.sets = insertWarmupRow(entry.sets, m, entry.target || {})
  return true
}

/**
 * Pair two adjacent active exercise entries into a superset group.
 *
 * Mutates `S.active.entries` in-place using `pairAdjacent`.
 *
 * @param {Object} S - Application state atom.
 * @param {number} firstIdx - Index of first entry.
 * @param {number} secondIdx - Index of adjacent second entry (`|firstIdx - secondIdx| === 1`).
 * @returns {boolean} True if pairing succeeded, false if active entries are missing.
 */
export function pairActiveSuperset(S, firstIdx, secondIdx) {
  if (!S?.active?.entries) return false
  S.active.entries = pairAdjacent(S.active.entries, firstIdx, secondIdx)
  return true
}

/**
 * Dissolve superset membership for an active exercise entry.
 *
 * Prunes orphaned singleton partner groups via `unpairSuperset`. Mutates `S.active.entries` in-place.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of entry to ungroup.
 * @returns {boolean} True if unpairing succeeded, false if active entries are missing.
 */
export function unpairActiveSuperset(S, entryIdx) {
  if (!S?.active?.entries) return false
  S.active.entries = unpairSuperset(S.active.entries, entryIdx)
  return true
}

/**
 * Toggle completion of a set row and compute all workout lifecycle transitions.
 *
 * Encapsulates the complete state transition for a set toggle:
 * - Flips `set.done` boolean.
 * - Tracks high-water mark progress on work sets (ignoring warm-up rows).
 * - Detects exercise, superset unit, and entire workout completion.
 * - Executes superset wrap-around navigation (`A.cur`).
 * - Flags when working weight confirmation sheet (`topW`) should prompt.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of active entry.
 * @param {number} setIdx - Index of set row being toggled.
 * @param {Object} [opts] - Session progress tracking options.
 * @param {number} [opts.highWater=0] - Previous high-water count of completed work sets in mounted exercise.
 * @returns {Object|null} Declarative outcome descriptor for UI side effects, or null on invalid target:
 *   - `checked`: boolean indicating new `done` state of the set.
 *   - `askTop`: boolean indicating working-weight confirmation sheet should open.
 *   - `workoutDone`: boolean indicating all units in the workout are finished.
 *   - `exJustDone`: boolean indicating the current exercise just finished all work sets.
 *   - `cardioEntry`: boolean indicating if entry is cardio mode.
 *   - `timedEntry`: boolean indicating if entry is timed mode.
 *   - `mode`: 'reps' | 'time' | 'cardio'.
 *   - `newHighWater`: updated maximum completed work sets.
 *   - `navigated`: boolean indicating whether `active.cur` transitioned to a partner/next unit.
 *   - `shouldRest`: boolean indicating rest timer should start.
 *   - `shouldStopRest`: boolean indicating running rest timer should cancel.
 *   - `roundDone`: boolean indicating all members in current superset round are completed.
 *   - `unitDone`: boolean indicating entire superset unit is completed.
 *   - `cur`: current active exercise index after any navigation.
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
  // Warm-up rows are prep, not work. The unit is done when no member has an
  // undone work row — the same `hasWork` rule the superset step below reads, so
  // an unticked warm-up can no longer keep a finished unit reading as unfinished.
  const unitDone = !unit.some(ui => hasWork(A.entries, ui))

  let askTop = false
  let exJustDone = false
  let workoutDone = false

  if (checked) {
    if (unitDone && isLastUnit) {
      workoutDone = true
    }
    const loaded = mode === 'reps' && !(isBw({ ...(entry.target || {}), id: entry.id }) && !entry.sets.some(x => x.w > 0))
    if (isExerciseDone(entry)) {
      exJustDone = true
      if (loaded && !entry.asked) {
        entry.asked = true
        askTop = true
      }
    }
  }

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
      if (unitDone) shouldStopRest = true
      if (!unit || unit.length <= 1) {
        if (!unitDone) {
          shouldRest = true
        }
      } else {
        const step = supersetFlowStep(A.entries, unit, entryIdx)
        if (step) {
          if (step.unitDone) {
            if (!isLastUnit) {
              const nextUnit = units[unitIdx + 1]
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
    unitDone,
    cur: A.cur
  }
}

// --- in-session weight confirmation -----------------------------------

/**
 * Set the confirmed working weight for an active entry and record it in `exWeights`.
 *
 * Updates `entry.topW` and applies monotonic max merge to `S.exWeights[entry.id]`.
 * Mutates `S` in-place; must be executed within `useStore.update(...)`.
 *
 * @param {Object} S - Application state atom.
 * @param {number} entryIdx - Index of entry in active session.
 * @param {number} weight - Working load in active units.
 * @param {Object} [opts] - Injectable clock options for testing (`todayISO`).
 * @returns {boolean} True if working weight was valid and applied; false otherwise.
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
 * Map an active workout session into a persistable completed workout record.
 *
 * Pure function: filters out unperformed entries (zero completed sets), freezes routine metadata,
 * attaches personal record (PR) flags, and records muscle fatigue snapshots for custom exercises.
 * Completion options arrive as a destructured second argument.
 *
 * @param {Object} active - Active session object (`S.active`).
 * @param {number} [end=Date.now()] - Workout finish epoch timestamp in milliseconds.
 * @param {Array<string>} [prs=[]] - Exercise IDs that established personal records.
 * @param {string} [unit='kg'] - Active weight unit.
 * @param {(entry: Object) => Object|null} [snapshotFor] - Custom exercise muscle snapshot provider.
 * @returns {Object} Persistable workout entity for `S.workouts`.
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
 * Finalize the active workout session and commit it to historical log.
 *
 * Evaluates personal records (heaviest completed sets) and estimated 1RM records against history,
 * calculates total tonnage volume (`vol`), merges peak loads into `exWeights`, appends the
 * completed workout to `S.workouts` sorted chronologically, and clears `S.active`.
 * Mutates `S` in-place; must be executed within `useStore.update(...)`.
 *
 * @param {Object} S - Application state atom.
 * @param {Object} [opts] - Injectable clock options for testing (`now`).
 * @returns {{ workout: Object, prs: Array<string>, e1prs: Array<Object> }|null}
 *   Summary boundary data for UI recap, or null if no active workout was present.
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
      for (const w of S.workouts || []) {
        for (const en of w.entries || []) {
          if (en.id === e.id) {
            const cur = bestWeightForEntry(en)
            if (cur > bestHistory) bestHistory = cur
          }
        }
      }
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

