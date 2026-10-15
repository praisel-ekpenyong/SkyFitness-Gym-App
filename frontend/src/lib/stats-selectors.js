// Stats selectors: the single seam between stored training history and every stats view.
//
// Views never scan workouts directly. They call selectStatsOverview for the muscle,
// fatigue, strength and effort cards, and selectExerciseStats for one exercise's
// progress curve. Both selectors are pure snapshots over (S, now): the same inputs
// always produce the same display-ready output, and views stay free of imports from
// the domain helpers composed here.
import { EXIDX } from './exercises.js'
import { fatigueOf, strengthOf, fatigueStateOf, LB_TO_KG } from './recovery.js'
import { MUSCLES, loadOfWorkouts, rankOf } from './muscles.js'
import { e1rmSeries, best1RM } from './onerm.js'
import {
  displayScale, scaleName, toScale, avgRir,
  effortSummary, effortWeeks, effortHistogram, isHardSet, rirOf,
} from './effort.js'
import {
  isWarmupRow, metricRowsForEntry, metricModeForEntry, bestWeightForEntry,
} from './workout-model.js'
import { workoutTimestamp } from './format.js'
import { strengthExerciseRowsForMuscle } from './strength-exercises.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Catalogue seam. The default reads the shipped index; tests and future catalogue
// sources inject { lookup }. A miss here means "unknown exercise" even when stale
// history rows still carry the id — the curve has nothing to name or weigh.
export const defaultCatalogue = { lookup: id => EXIDX[id] ?? null }

/** Round a display load to one decimal place. */
const round1 = value => Math.round(value * 10) / 10

function requireNow(fn, now) {
  const current = Number(now)
  if (!Number.isFinite(current)) throw new Error(`${fn}: now is required`)
  return current
}

function resolveCatalogue(catalogue) {
  return catalogue && typeof catalogue.lookup === 'function' ? catalogue : defaultCatalogue
}

// A window in days back from the injected now. 0 (or another falsy value) keeps
// all history — the same convention effort.js uses, but anchored to `now` instead
// of the wall clock so snapshots stay deterministic.
function inWindow(workouts, now, days) {
  if (!days) return [...(workouts || [])]
  const cutoff = now - days * DAY_MS
  return (workouts || []).filter(w => {
    const ts = workoutTimestamp(w)
    return Number.isFinite(ts) && ts > cutoff
  })
}

// The lifter's body mass in kg: an explicit override wins, otherwise the latest
// registered weigh-in (profile unit converted), otherwise null — which the
// recovery model reads as its stable fallback.
function resolveBodyweightKg(S, override) {
  if (override !== undefined && override !== null) {
    const n = Number(override)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const entries = S?.bodyweight || []
  const ordered = entries.slice().sort((a, b) => String(a?.d).localeCompare(String(b?.d)))
  for (let i = ordered.length - 1; i >= 0; i--) {
    const w = Number(ordered[i]?.w)
    if (w > 0) return S?.unit === 'lb' ? w * LB_TO_KG : w
  }
  return null
}

// Completed work sets of one window: the only rows that ever count.
function workSetsOf(workouts) {
  const out = []
  for (const w of workouts || []) {
    for (const e of w?.entries || []) {
      for (const s of e?.sets || []) {
        if (s?.done === true && !isWarmupRow(s)) out.push(s)
      }
    }
  }
  return out
}

/**
 * Snapshot the overview cards: muscle balance, fatigue, strength, and effort.
 *
 * @param {Object} S - App state with workouts, bodyweight, unit, and effort setting.
 * @param {Object} opts - { now, catalogue?, muscleDays?, hardOnly?, effortDays?, bodyweightKg? }.
 *   now is required. muscleDays/effortDays default to 30/90; 0 means all history.
 *   hardOnly asks for the hard-set map and falls back to all sets silently when the
 *   window holds no hard sets (see hardActive/rated).
 * @returns {Object} Display-ready overview with an exercisesFor(slug) closure over
 *   the same (S, now) snapshot.
 */
export function selectStatsOverview(S, opts = {}) {
  const now = requireNow('selectStatsOverview', opts?.now)
  resolveCatalogue(opts?.catalogue)
  const muscleDays = opts?.muscleDays ?? 30
  const effortDays = opts?.effortDays ?? 90
  const hardRequested = !!opts?.hardOnly
  const bodyweightKg = resolveBodyweightKg(S, opts?.bodyweightKg)
  const workouts = S?.workouts || []

  const fatOpts = { bodyweightKg, unit: S?.unit }
  const fatigueValues = fatigueOf(workouts, now, fatOpts)
  const strengthValues = strengthOf(workouts, now, fatOpts)
  const fatigueStates = Object.fromEntries(
    MUSCLES.map(slug => [slug, fatigueStateOf(fatigueValues[slug])]),
  )

  const muscleWin = inWindow(workouts, now, muscleDays)
  const windowSets = workSetsOf(muscleWin)
  const rated = windowSets.some(s => rirOf(s) != null)
  const hardActive = hardRequested && windowSets.some(isHardSet)
  const rawLoad = loadOfWorkouts(muscleWin, hardActive ? isHardSet : null)
  const load = Object.fromEntries(MUSCLES.map(slug => [slug, round1(rawLoad[slug] || 0)]))
  const { worked, missed } = rankOf(load)

  const scale = displayScale(S)
  const effortWin = inWindow(workouts, now, effortDays)
  const scoped = { ...S, workouts: effortWin }
  const sum = effortSummary(scoped, 0)
  const weeks = effortWeeks(scoped, 0).map(e => ({
    t: e.t, rir: e.rir, y: toScale(scale, e.rir), n: e.n, sets: e.sets,
  }))
  const histogram = effortHistogram(scoped, 0)

  return {
    now,
    bodyweightKg,
    scale,
    scaleName: scaleName(scale),
    muscles: {
      days: muscleDays,
      hardRequested,
      rated,
      hardActive,
      load,
      worked,
      missed,
      top: worked.slice(0, 4),
    },
    fatigue: { values: fatigueValues, states: fatigueStates },
    strength: { values: strengthValues },
    effort: {
      days: effortDays,
      avg: toScale(scale, sum.avg),
      hardPct: sum.hardPct,
      done: sum.done,
      rated: sum.rated,
      hard: sum.hard,
      weeks,
      histogram,
    },
    exercisesFor: slug => strengthExerciseRowsForMuscle(S, now, slug),
  }
}

function entriesFor(S, exId) {
  const out = []
  for (const w of S?.workouts || []) {
    const entry = (w?.entries || []).find(e => e?.id === exId)
    if (entry) out.push({ workout: w, entry })
  }
  return out
}

// Overall logging mode: any completed reps work row is authoritative (a strength
// signal survives mixed-mode entries); otherwise the latest entry's own metric
// mode; otherwise the catalogue record.
function resolveMode(pairs, catalogueRecord) {
  for (const { entry } of pairs) {
    if (metricRowsForEntry(entry, 'reps').length) return 'reps'
  }
  for (let i = pairs.length - 1; i >= 0; i--) {
    const mode = metricModeForEntry(pairs[i].entry)
    if (mode) return mode
  }
  const cm = catalogueRecord?.mode
  if (cm === 'reps' || cm === 'time' || cm === 'cardio') return cm
  if (catalogueRecord?.bp === 'cardio') return 'cardio'
  const tg = String(catalogueRecord?.tg || '').toLowerCase().trim()
  if (tg === 'cardio' || tg === 'cardiovascular system') return 'cardio'
  return 'reps'
}

const sessionMetric = (mode, set) => mode === 'cardio' ? (set?.speed || 0) : (set?.sec || 0)

// Latest chronological point beats every prior one: the record, with the previous
// best for context. Needs at least two sessions — a single session is a baseline,
// not a record.
function recordOf(sortedPts, readValue) {
  if (sortedPts.length < 2) return null
  const last = sortedPts[sortedPts.length - 1]
  const prev = Math.max(...sortedPts.slice(0, -1).map(readValue))
  if (!(readValue(last) > prev)) return null
  return { ...last, prev }
}

/**
 * Snapshot one exercise's progress curve.
 *
 * @param {Object} S - App state with workouts, unit, and effort setting.
 * @param {string} exId - Exercise id, resolved through the catalogue adapter.
 * @param {Object} opts - { now, catalogue? }. now is required.
 * @returns {Object|null} Display-ready exercise stats, or null for an unknown id.
 *   Estimated 1RM appears for reps mode only; effort averages use the profile
 *   display scale and are null when nothing was rated.
 */
export function selectExerciseStats(S, exId, opts = {}) {
  const now = requireNow('selectExerciseStats', opts?.now)
  const catalogue = resolveCatalogue(opts?.catalogue)
  const record = catalogue.lookup(exId) ?? null
  if (record == null) return null

  const pairs = entriesFor(S, exId)
  const mode = resolveMode(pairs, record)
  const unit = mode === 'cardio' ? 'km/h' : mode === 'time' ? 's' : (S?.unit ?? 'kg')
  const scale = displayScale(S)
  const hd = scaleName(scale)

  const points = []
  for (const { workout, entry } of pairs) {
    if (metricModeForEntry(entry) !== mode) continue
    const rows = metricRowsForEntry(entry, mode)
    const mx = mode === 'reps'
      ? bestWeightForEntry(entry)
      : rows.reduce((best, s) => Math.max(best, Number(sessionMetric(mode, s)) || 0), 0)
    if (!(mx > 0)) continue
    points.push({
      t: workoutTimestamp(workout),
      d: workout?.d,
      y: round1(mx),
      sets: rows,
      target: entry?.target || null,
    })
  }
  const best = points.reduce((m, p) => Math.max(m, p.y), 0)

  const rirs = points.map(p => avgRir(p.sets))
  const ratedCount = rirs.filter(v => v != null).length
  const dots = points.map((p, i) => {
    const rir = rirs[i]
    return {
      t: p.t,
      d: p.d,
      y: p.y,
      m: rir == null ? null : 1 - Math.min(4, Math.max(0, rir)) / 4,
      note: rir == null ? undefined : `${hd} ${toScale(scale, rir)}`,
    }
  })
  const effortPoints = []
  points.forEach((p, i) => {
    if (rirs[i] != null) effortPoints.push({ t: p.t, d: p.d, y: toScale(scale, rirs[i]) })
  })

  const e1rmPoints = mode === 'reps' ? e1rmSeries(S, exId) : []
  const e1rmBest = mode === 'reps' ? best1RM(S, exId) : null
  let exerciseRecord = null
  if (mode === 'reps') {
    const sorted = [...e1rmPoints].sort((a, b) => a.t - b.t)
    const hit = recordOf(sorted, p => p.y)
    if (hit) exerciseRecord = { est: hit.y, w: hit.w, r: hit.r, prev: hit.prev }
  } else {
    const sorted = [...points].sort((a, b) => a.t - b.t)
    const hit = recordOf(sorted, p => p.y)
    if (hit) exerciseRecord = { value: hit.y, prev: hit.prev }
  }

  return {
    id: exId,
    name: record?.n ?? exId,
    mode,
    unit,
    points: dots,
    best,
    e1rmPoints,
    e1rmBest,
    effort: {
      scale,
      avg: toScale(scale, avgRir(points.flatMap(p => p.sets))),
      points: effortPoints,
      ratedCount,
      hasCurve: ratedCount >= 3,
    },
    record: exerciseRecord,
    _now: now,
  }
}
