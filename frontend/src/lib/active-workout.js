// Active-workout lifecycle — the one deep module behind the named store actions.
//
// Every Profile mutation that touches the in-progress workout, the heaviest-ever
// weight cache (exWeights), or the finished-workout boundary now crosses this
// seam. UI files become thin callers; the three divergent exWeights merge
// policies (always-max/today, only-if-heavier/workout-date, newer-date-wins)
// collapse to one, and the duplicated best-weight read becomes bestKnownWeight.

import { isWarmupRow, buildSets, workoutVolume, bestWeightForEntry } from './workout-model.js'
import { nextPrescription, applyPrescription } from './progression.js'
import { buildCompletedWorkout } from './finish-workout.js'
import { is1RMRecord } from './onerm.js'
import { EXIDX } from './exercises.js'
import { exerciseMuscleSnapshot } from './muscles.js'
import { uid, todayISO } from './format.js'
import { t } from './i18n.js'

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
    cur: 0,
    entries,
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
  // Load PRs: heaviest done set weight vs history (pre-workout history, not exWeights)
  // Kept identical to the pre-seam semantics so the existing load PR wording stays
  // stable; the merge below uses heaviestForEntry (with topW) so the two no longer
  // diverge inside one flow.
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
    snapshotFor: en => (EXIDX[en.id]?.custom ? exerciseMuscleSnapshot(EXIDX[en.id]) : null),
  })
  w.vol = workoutVolume(w)

  for (const e of w.entries) {
    const mx = heaviestForEntry(e)
    if (mx > 0) mergeExWeight(S, e.id, mx, w.d)
  }
  // Import path reuses mergeExWeight with w.d as well; monotonic max means the
  // newest imported day does not overwrite a heavier earlier best.

  S.workouts = [...(S.workouts || []), w]
  // Keep workouts sorted by date for stable history rendering (existing code
  // pushes in chronological order because finish is always today, but imports
  // may interleave). Sorting here is cheap and preserves locality.
  S.workouts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.start - b.start))
  S.active = null
  return { workout: w, prs, e1prs }
}
