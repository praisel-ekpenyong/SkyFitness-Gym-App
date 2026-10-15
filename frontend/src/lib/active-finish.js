// Finishing the Active workout — one slice of the active-workout lifecycle.
//
// Heaviest-weight cache (`exWeights`), working-weight confirmation, PR /
// estimated-1RM detection, and the completed-Workout boundary. Session
// construction lives in active-session.js, set surgery in active-sets.js,
// the toggle decision in active-toggle.js.
import { isWarmupRow, workoutVolume, bestWeightForEntry } from './workout-model.js'
import { is1RMRecord } from './onerm.js'
import { EXIDX } from './exercises.js'
import { exerciseMuscleSnapshot } from './muscles.js'
import { todayISO } from './format.js'

/**
 * Highest load logged for an exercise across finished workouts.
 *
 * Shared read behind both the Best tag (`bestKnownWeight`) and PR detection
 * (`completeActiveSession`), so the two can never disagree on what history
 * says. Warm-up rows and unperformed sets never count (`bestWeightForEntry`).
 *
 * @param {Object} S - Application state atom containing `workouts`.
 * @param {string} exId - Exercise identifier from EXIDX.
 * @returns {number} Heaviest logged load, or 0 if unrecorded.
 */
function bestLoggedWeight(S, exId) {
  let best = 0
  for (const w of S.workouts || []) {
    for (const e of w.entries || []) {
      if (e.id === exId) {
        const cur = bestWeightForEntry(e)
        if (cur > best) best = cur
      }
    }
  }
  return best
}

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
  const best = bestLoggedWeight(S, exId)
  const cur = S.exWeights?.[exId]?.w
  if (typeof cur === 'number' && cur > best) return cur
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
      const bestHistory = bestLoggedWeight(S, e.id)
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
