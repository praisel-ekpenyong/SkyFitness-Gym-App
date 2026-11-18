import { EXDB, EXIDX } from './exercises.js'
import { fatigueOf, strengthOf, fatigueStateOf } from './recovery.js'
import { MUSCLES, loadOfWorkouts, loadOfRoutine, rankOf, lastTrainedByMuscle } from './muscles.js'
import { LB_TO_KG } from './bodyweight.js'
import { best1RM, e1rmSeries, loadRecords, metric } from './training-log.js'
import {
  displayScale, scaleName, toScale, avgRir,
  effortSummary, effortWeeks, effortHistogram, isHardSet, rirOf, hasEffort, effortOf, HARD_RIR,
} from './effort.js'
import { modeOf } from './workout-model.js'
import { isPerformed, isWorkSet, metricRowsForEntry, metricModeForEntry } from './workout-sets.js'
import { workoutTimestamp, isoOf, weekKey, monthKey } from './dates.js'
import { trainedWeeks, effectiveRoutine } from './history.js'
import { streakOf } from './streak.js'
import { strengthExerciseRowsForMuscle } from './strength-exercises.js'
import { volumeRangeOf, verdictOf } from './volume-ranges.js'
import { REST } from './schedule.js'
import { strengthLevelsOf, strengthLevelOf } from './strength-level.js'

const DAY_MS = 24 * 60 * 60 * 1000

const builtInIndex = Object.fromEntries(EXDB.map(ex => [ex.id, EXIDX[ex.id]]))
export const defaultCatalogue = { lookup: id => builtInIndex[id] ?? null }

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
      if (!entry || typeof entry !== 'object') continue
      const snapshot = entry.exercise || entry.muscleSnapshot || entry
      const name = snapshot.n || entry.n
      if (name) historical.set(entry.id, { ...entry, ...snapshot, n: name })
    }
  }
  return { lookup: id => custom.get(id) || defaultCatalogue.lookup(id) || historical.get(id) || null }
}

function muscleCatalogueOf(S, catalogue) {
  const logged = new Map()
  for (const workout of S?.workouts || []) {
    for (const entry of workout.entries || []) {
      if (!entry || typeof entry !== 'object') continue
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

/** An entry with its catalogue exercise merged underneath, so muscle attribution reads the catalogue. */
function withCatalogueEntry(entry, catalogue) {
  const resolved = catalogue?.lookup(entry?.id)
  return resolved && typeof resolved === 'object' ? { ...resolved, ...entry } : entry
}

function projectWorkouts(workouts, catalogue) {
  return (workouts || []).map(workout => ({
    ...workout,
    entries: (workout.entries || [])
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => withCatalogueEntry(entry, catalogue)),
  }))
}

function inWindow(workouts, now, days) {
  if (!days) return [...(workouts || [])]
  const cutoff = now - days * DAY_MS
  return (workouts || []).filter(w => {
    const ts = workoutTimestamp(w)
    return Number.isFinite(ts) && ts > cutoff
  })
}

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

function workSetsOf(workouts) {
  const out = []
  for (const w of workouts || []) {
    for (const e of w?.entries || []) {
      if (!e || typeof e !== 'object') continue
      for (const s of e?.sets || []) {
        if (isPerformed(s) && isWorkSet(s)) out.push(s)
      }
    }
  }
  return out
}

/** The day an Active workout belongs to: its date, else the day it started. */
function activeDayOf(active) {
  if (typeof active?.d === 'string') return active.d
  return Number.isFinite(active?.start) ? isoOf(new Date(active.start)) : null
}

/**
 * Planned work-set load still ahead this ISO week: today's routine (only before anything is
 * trained today) plus every remaining day's effective routine. Null without a week schedule
 * naming at least one existing routine.
 */
function plannedLoadOf(S, today, muscleCatalogue) {
  const routineIds = new Set((S?.routines || []).map(r => r?.id))
  if (!Object.values(S?.week || {}).some(id => id && id !== REST && routineIds.has(id))) return null
  const week = weekKey(today)
  const trainedToday = activeDayOf(S?.active) === today || (S?.workouts || []).some(w => w.d === today)
  const planned = {}
  const day = new Date(today + 'T12:00:00')
  if (trainedToday) day.setDate(day.getDate() + 1)
  for (let iso = isoOf(day); weekKey(iso) === week; day.setDate(day.getDate() + 1), iso = isoOf(day)) {
    const routine = effectiveRoutine(S, iso)
    if (!routine) continue
    const ex = (routine.ex || []).map(c => withCatalogueEntry(c, muscleCatalogue))
    const load = loadOfRoutine({ ...routine, ex })
    for (const slug in load) planned[slug] = (planned[slug] || 0) + load[slug]
  }
  return planned
}

/**
 * Weekly volume reading: effective sets done this ISO week (Workouts plus the Active workout)
 * per muscle, against its volume range.
 */
function weeklyVolumeOf(S, today, muscleCatalogue) {
  const week = weekKey(today)
  const thisWeek = (S?.workouts || []).filter(w => weekKey(w.d) === week)
  const activeDay = activeDayOf(S?.active)
  const sources = activeDay && weekKey(activeDay) === week ? [...thisWeek, S.active] : thisWeek
  const raw = loadOfWorkouts(projectWorkouts(sources, muscleCatalogue))
  const planned = plannedLoadOf(S, today, muscleCatalogue)
  const muscles = Object.fromEntries(MUSCLES.map(slug => {
    const done = round1(raw[slug] || 0)
    const projected = planned ? round1((raw[slug] || 0) + (planned[slug] || 0)) : null
    const { range, edited } = volumeRangeOf(S, slug)
    return [slug, { done, projected, range, verdict: verdictOf(projected ?? done, range, slug), edited }]
  }))
  return { week, muscles }
}

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
      if (!entry || typeof entry !== 'object') continue
      const record = catalogue.lookup(entry.id)
      if (!record) continue
      const mode = metricModeForEntry(entry) || resolveMode([], record)
      const current = metric(S, workout, entry)
      if (current > 0 || !index.has(entry.id)) {
        index.set(entry.id, { id: entry.id, name: record.n || entry.id, current, mode, unit: unitFor(mode, S) })
      }
    }
  }
  const exerciseIndex = [...index.values()].sort((a, b) => b.current - a.current || a.name.localeCompare(b.name))

  const streak = streakOf(S, now)

  return {
    now,
    exerciseIndex,
    bodyweightKg,
    bodyweight,
    counts: { total: workouts.length, month: workouts.filter(w => monthKey(w) === monthKey(today)).length, streak: { current: streak.current, best: streak.best, freezes: streak.freezes }, weeks12: trainedWeeks(S, 12, now) },
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
      top: worked.slice(0, 5),
    },
    fatigue: { values: fatigueValues, states: fatigueStates },
    weeklyVolume: weeklyVolumeOf(S, today, muscleCatalogue),
    strengthLevels: strengthLevelsOf(S, now),
    strength: {
      values: strengthValues,
      latest,
      weeks: trainingWeeks,
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

function resolveMode(pairs, catalogueRecord) {
  for (let i = pairs.length - 1; i >= 0; i--) {
    const mode = metricModeForEntry(pairs[i].entry)
    if (mode) return mode
  }
  return modeOf(catalogueRecord)
}

const unitFor = (mode, S) => mode === 'cardio' ? 'km/h' : mode === 'time' ? 's' : (S?.unit ?? 'kg')

function recordIndexOf(S, workout, exId, rows, mode) {
  if (mode !== 'reps') return null
  const rec = loadRecords(S, workout).find(r => r.id === exId)
  const at = rec?.set ? rows.indexOf(rec.set) : -1
  return at < 0 ? null : at
}

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
    const mx = metric(S, workout, entry)
    if (!(mx > 0)) continue
    points.push({
      t: workoutTimestamp(workout),
      d: workout?.d,
      y: round1(mx),
      sets: rows,
      target: entry?.target || null,
      record: recordIndexOf(S, workout, exId, rows, mode),
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
    strength: strengthLevelOf(S, exId, now),
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
