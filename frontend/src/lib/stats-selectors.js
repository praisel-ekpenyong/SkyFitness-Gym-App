// Stats selectors: the single seam between stored training history and every stats view.
//
// Views never scan workouts directly. They call selectStatsOverview for the muscle,
// fatigue, strength and effort cards, and selectExerciseStats for one exercise's
// progress curve. Both selectors are pure snapshots over (S, now): the same inputs
// always produce the same display-ready output, and views stay free of imports from
// the domain helpers composed here.
import { EXDB } from './exercises.js'
import { fatigueOf, strengthOf, fatigueStateOf } from './recovery.js'
import { MUSCLES, loadOfWorkouts, rankOf, lastTrainedByMuscle } from './muscles.js'
import { LB_TO_KG } from './bodyweight.js'
import { e1rmSeries, best1RM } from './onerm.js'
import {
  displayScale, scaleName, toScale, avgRir,
  effortSummary, effortWeeks, effortHistogram, isHardSet, rirOf, hasEffort, effortOf, HARD_RIR,
} from './effort.js'
import {
  isPerformed, isWorkSet, metricRowsForEntry, metricModeForEntry, bestWeightForEntry, modeOf,
} from './workout-model.js'
import { workoutTimestamp, isoOf, weekKey, monthKey } from './format.js'
import { streakWeeks } from './history.js'
import { strengthExerciseRowsForMuscle } from './strength-exercises.js'

const DAY_MS = 24 * 60 * 60 * 1000

// Catalogue seam. The default reads the shipped index; tests and future catalogue
// sources inject { lookup }. A miss here means "unknown exercise" even when stale
// history rows still carry the id — the curve has nothing to name or weigh.
const builtInIndex = Object.fromEntries(EXDB.map(ex => [ex.id, ex]))
export const defaultCatalogue = { lookup: id => builtInIndex[id] ?? null }

/** Round a display load to one decimal place. */
const round1 = value => Math.round(value * 10) / 10

function requireNow(fn, now) {
  const current = now
  if (!Number.isFinite(current)) throw new Error(`${fn}: now is required`)
  return current
}

function resolveCatalogue(S, catalogue) {
  if (catalogue) return catalogue
  const custom = new Map((S?.customEx || []).map(ex => [ex.id, ex]))
  const historical = new Map()
  for (const workout of S?.workouts || []) {
    for (const entry of workout.entries || []) {
      const snapshot = entry.exercise || entry.muscleSnapshot || entry
      const name = snapshot.n || entry.n
      if (name) historical.set(entry.id, { ...entry, ...snapshot, n: name })
    }
  }
  return { lookup: id => custom.get(id) || defaultCatalogue.lookup(id) || historical.get(id) || null }
}

// Muscle attribution prefers what the lifter logged: a snapshot carrying muscleWeights was
// captured when the set was performed, so it beats the catalogue record even when the
// catalogue's mapping has since been re-derived, and the catalogue answers before a bare
// historical entry. Identity lookups (names, modes) keep the plain catalogue order.
function muscleCatalogueOf(S, catalogue) {
  const logged = new Map()
  for (const workout of S?.workouts || []) {
    for (const entry of workout.entries || []) {
      if (logged.has(entry.id)) continue
      const snapshot = entry.exercise || entry.muscleSnapshot || entry
      const weights = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? snapshot.muscleWeights
        : null
      if (weights && typeof weights === 'object' && !Array.isArray(weights) && Object.keys(weights).length) {
        logged.set(entry.id, { ...entry, ...snapshot, n: snapshot.n || entry.n })
      }
    }
  }
  return { lookup: id => logged.get(id) || catalogue.lookup(id) || null }
}

// muscleWeightsOf reads the entry it is handed and does not take a catalogue.
// Overlay the resolved exercise first so a Profile custom, or a logged snapshot
// from an earlier entry of the same exercise, still attributes when this entry
// carries no muscle metadata of its own. The entry's own fields win, including
// a muscleWeights map logged on it.
function projectWorkouts(workouts, catalogue) {
  return (workouts || []).map(workout => ({
    ...workout,
    entries: (workout.entries || []).map(entry => {
      if (!entry || typeof entry !== 'object') return entry
      const resolved = catalogue?.lookup(entry.id)
      return resolved && typeof resolved === 'object' ? { ...resolved, ...entry } : entry
    }),
  }))
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
    if (Number.isFinite(w) && w > 0) return S?.unit === 'lb' ? w * LB_TO_KG : w
  }
  return null
}

// Completed work sets of one window: the only rows that ever count.
function workSetsOf(workouts) {
  const out = []
  for (const w of workouts || []) {
    for (const e of w?.entries || []) {
      for (const s of e?.sets || []) {
        if (isPerformed(s) && isWorkSet(s)) out.push(s)
      }
    }
  }
  return out
}

/**
 * Snapshot counts, body-weight trends, exercise index and training readings.
 *
 * @param {Object} S - App state with workouts, bodyweight, unit, and effort setting.
 * @param {Object} opts - { now, catalogue?, muscleDays?, hardOnly?, effortDays?, bodyweightDays?, bodyweightKg? }.
 *   now is a required finite timestamp. Windows default to 30/90/90 days; 0 means all history.
 *   muscleDays=7 selects the current local calendar week.
 *   hardOnly asks for the hard-set map and falls back to all sets silently when the
 *   window holds no hard sets (see hardActive/rated).
 * @returns {Object} Display-ready overview with an exercisesFor(slug) closure over
 *   the same (S, now) snapshot.
 */
export function selectStatsOverview(S, opts = {}) {
  const now = requireNow('selectStatsOverview', opts?.now)
  const catalogue = resolveCatalogue(S, opts?.catalogue)
  const muscleCatalogue = muscleCatalogueOf(S, catalogue)
  const muscleDays = opts?.muscleDays ?? 30
  const effortDays = opts?.effortDays ?? 90
  const hardRequested = !!opts?.hardOnly
  const bodyweightKg = resolveBodyweightKg(S, opts?.bodyweightKg)
  const workouts = S?.workouts || []
  const attributed = projectWorkouts(workouts, muscleCatalogue)

  const fatOpts = { bodyweightKg, unit: S?.unit }
  const fatigueValues = fatigueOf(attributed, now, fatOpts)
  const strengthValues = strengthOf(attributed, now, fatOpts)
  const trainedAt = lastTrainedByMuscle(attributed)
  const latest = Object.fromEntries(MUSCLES.map(slug =>
    [slug, Number.isFinite(trainedAt[slug]) ? trainedAt[slug] : null]))
  const trainingWeeks = Object.fromEntries(MUSCLES.map(slug => [slug,
    latest[slug] == null ? null : Math.max(0, Math.floor((now - latest[slug]) / DAY_MS / 7)),
  ]))
  const { worked: strengthOrder } = rankOf(strengthValues)

  const fatigueStates = Object.fromEntries(
    MUSCLES.map(slug => [slug, fatigueStateOf(fatigueValues[slug])]),
  )

  const today = isoOf(new Date(now))
  const muscleWin = muscleDays === 7
    ? workouts.filter(w => weekKey(w.d) === weekKey(today))
    : inWindow(workouts, now, muscleDays)
  const windowSets = workSetsOf(muscleWin)
  const rated = windowSets.some(s => rirOf(s) != null)
  const hardActive = hardRequested && windowSets.some(isHardSet)
  const rawLoad = loadOfWorkouts(projectWorkouts(muscleWin, muscleCatalogue), hardActive ? isHardSet : null)
  const load = Object.fromEntries(MUSCLES.map(slug => [slug, round1(rawLoad[slug] || 0)]))
  const { worked, missed } = rankOf(load)

  const scale = displayScale(S)
  const effortWin = inWindow(workouts, now, effortDays)
  const scoped = { ...S, workouts: effortWin }
  const sum = effortSummary(scoped, 0)
  const weeks = effortWeeks(scoped, 0).map(e => ({
    t: e.t, rir: e.rir, y: toScale(scale, e.rir), n: e.n, sets: e.sets,
  }))
  const bins = effortHistogram(scoped, 0)
  const maxBin = Math.max(1, ...bins.map(bin => bin.n))
  const histogram = bins.map(bin => ({ ...bin,
    value: toScale(scale, bin.rir), hard: bin.rir <= HARD_RIR,
    width: Math.round(bin.n / maxBin * 100), percent: Math.round(bin.pct * 100),
  }))
  const weighIns = (S?.bodyweight || []).filter(b => Number.isFinite(Number(b.w)) && Number(b.w) > 0 && Number.isFinite(workoutTimestamp(b)))
    .slice().sort((a, b) => workoutTimestamp(a) - workoutTimestamp(b))
  const recentWeight = inWindow(weighIns, now, 30)
  const bodyweight = {
    points: inWindow(weighIns, now, opts.bodyweightDays ?? 90).map(b => ({ t: workoutTimestamp(b), d: b.d, y: Number(b.w) })),
    latest: weighIns.at(-1) || null,
    delta30: recentWeight.length > 1 ? round1(recentWeight.at(-1).w - recentWeight[0].w) : null,
    goal: Number.isFinite(S?.targetW) && S.targetW > 0 ? S.targetW : null,
  }

  const index = new Map()
  for (const workout of workouts) {
    for (const entry of workout.entries || []) {
      const record = catalogue.lookup(entry.id)
      if (!record) continue
      const mode = metricModeForEntry(entry) || resolveMode([], record)
      const current = metricOf(entry, mode)
      if (current > 0 || !index.has(entry.id)) {
        index.set(entry.id, { id: entry.id, name: record.n || entry.id, current, mode, unit: unitFor(mode, S) })
      }
    }
  }
  const exerciseIndex = [...index.values()].sort((a, b) => b.current - a.current || a.name.localeCompare(b.name))

  return {
    now,
    exerciseIndex,
    bodyweightKg,
    bodyweight,
    counts: { total: workouts.length, month: workouts.filter(w => monthKey(w) === monthKey(today)).length, streak: streakWeeks(S, now) },
    workouts: { recent: [...workouts].reverse().slice(0, 6), forDay: day => workouts.filter(w => w.d === day) },
    scale,
    scaleName: scaleName(scale),
    muscles: {
      days: muscleDays,
      count: muscleWin.length,
      max: worked.length ? load[worked[0]] : 0,
      hardRequested,
      rated,
      hardActive,
      load,
      worked,
      missed,
      top: worked.slice(0, 4),
    },
    fatigue: { values: fatigueValues, states: fatigueStates },
    strength: {
      values: strengthValues,
      latest,
      weeks: trainingWeeks,
      volume90: loadOfWorkouts(projectWorkouts(inWindow(workouts, now, 90), muscleCatalogue), null),
      order: strengthOrder,
      detrained: strengthOrder.filter(slug => strengthValues[slug] < 1),
    },
    hasEffort: hasEffort(S),
    effortEnabled: effortOf(S) !== 'none',
    effort: sum.rated ? {
      days: effortDays,
      hardThreshold: toScale(scale, HARD_RIR),
      avg: toScale(scale, sum.avg),
      hardPct: sum.hardPct,
      done: sum.done,
      rated: sum.rated,
      hard: sum.hard,
      weeks,
      histogram,
    } : null,
    exercisesFor: slug => strengthExerciseRowsForMuscle({ ...S, workouts: attributed }, now, slug),
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

// Within an entry, metricModeForEntry makes completed reps rows authoritative.
// Across entries, the latest logged Mode chooses the progress chart; the catalogue
// record is the last fallback through the shared modeOf cascade.
function resolveMode(pairs, catalogueRecord) {
  for (let i = pairs.length - 1; i >= 0; i--) {
    const mode = metricModeForEntry(pairs[i].entry)
    if (mode) return mode
  }
  return modeOf(catalogueRecord)
}

// The number a set scores in its mode: km/h speed for cardio, seconds for timed work.
const speedOrSecondsOf = (mode, set) => mode === 'cardio' ? (set?.speed || 0) : (set?.sec || 0)
const unitFor = (mode, S) => mode === 'cardio' ? 'km/h' : mode === 'time' ? 's' : (S?.unit ?? 'kg')

function metricOf(entry, mode) {
  const value = mode === 'reps'
    ? bestWeightForEntry(entry)
    : metricRowsForEntry(entry, mode).reduce((best, set) => Math.max(best, Number(speedOrSecondsOf(mode, set)) || 0), 0)
  return Number.isFinite(value) && value > 0 ? round1(value) : 0
}

/**
 * Snapshot one exercise's progress curve.
 *
 * @param {Object} S - App state with workouts, unit, and effort setting.
 * @param {string} exId - Exercise id, resolved through the catalogue adapter.
 * @param {Object} opts - { now, catalogue? }. now is required.
 * @returns {Object|null} Display-ready exercise stats, or null for an unknown id.
 *   Estimated 1RM appears for reps mode only; effort averages use the profile
 *   display scale. Effort is null when no included session was rated.
 */
export function selectExerciseStats(S, exId, opts = {}) {
  const now = requireNow('selectExerciseStats', opts?.now)
  const catalogue = resolveCatalogue(S, opts?.catalogue)
  const catalogueRecord = catalogue.lookup(exId) ?? null
  if (catalogueRecord == null) return null

  const pairs = entriesFor(S, exId)
  const mode = resolveMode(pairs, catalogueRecord)
  const unit = unitFor(mode, S)
  const scale = displayScale(S)

  const points = []
  for (const { workout, entry } of pairs) {
    if (metricModeForEntry(entry) !== mode) continue
    const rows = metricRowsForEntry(entry, mode)
    const mx = metricOf(entry, mode)
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
      ...p,
      m: rir == null ? null : 1 - Math.min(4, Math.max(0, rir)) / 4,
      effort: toScale(scale, rir),
    }
  })
  const effortPoints = []
  points.forEach((p, i) => {
    if (rirs[i] != null) effortPoints.push({ t: p.t, d: p.d, y: toScale(scale, rirs[i]) })
  })

  const e1rmPoints = mode === 'reps' ? e1rmSeries(S, exId) : []
  const e1rmBest = mode === 'reps' ? best1RM(S, exId) : null

  return {
    id: exId,
    name: catalogueRecord?.n ?? exId,
    mode,
    unit,
    points: dots,
    recent: points.slice(-5).reverse(),
    best,
    e1rmPoints,
    e1rmBest,
    hasEffort: ratedCount > 0,
    effort: ratedCount ? {
      scale,
      avg: toScale(scale, avgRir(points.flatMap(p => p.sets))),
      points: effortPoints,
      ratedCount,
      hasCurve: ratedCount >= 3,
    } : null,
    now,
  }
}
