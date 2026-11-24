import { applyHypertrophyPlan } from './hypertrophy-5day.js'
import { act } from '../active-workout.js'
import { recordWeighIn } from '../bodyweight.js'
import { isPerSide } from '../workout-model.js'
import { isWorkSet } from '../workout-sets.js'
import { registerCustom } from '../exercises.js'
import { epleyReps } from '../onerm.js'

/**
 * Deterministic synthetic history for the 5-day hypertrophy plan. Everything here is made up:
 * no real lifter's numbers. Sessions go through the real lifecycle (create → log → complete),
 * so each Entry carries the Prescription the engine actually made.
 */

const DAY_MS = 86400000
const BODYWEIGHT = 75

/** A made-up intermediate lifter: starting load and estimated 1RM per exercise. Customs are by name. */
const LIFTER = {
  '0025': { w: 70, e1rm: 90 }, '0652': { w: 2.5, e1rm: 20, bw: true }, '0238': { w: 20, e1rm: 34 },
  '0179': { w: 15, e1rm: 26 }, '0861': { w: 70, e1rm: 100 }, '0178': { w: 10, e1rm: 17 },
  '0194': { w: 20, e1rm: 34 }, '0043': { w: 60, e1rm: 100 }, '0085': { w: 60, e1rm: 110 },
  '0410': { w: 16, e1rm: 34 }, '0409': { w: 20, e1rm: 40 }, '0175': { w: 30, e1rm: 50 },
  '0314': { w: 26, e1rm: 36 }, '0405': { w: 20, e1rm: 30 }, '0180': { w: 60, e1rm: 90 },
  '0327': { w: 22, e1rm: 34 }, '0225': { w: 7.5, e1rm: 13 }, '0318': { w: 10, e1rm: 16 },
  '0313': { w: 14, e1rm: 22 },
  'Bayesian cable curl': { w: 12.5, e1rm: 20 }, 'Incline lying dumbbell leg curl': { w: 12, e1rm: 20 },
  'Heel-elevated dumbbell squat': { w: 24, e1rm: 45 }, 'Deep dumbbell sumo squat': { w: 28, e1rm: 55 },
  'Twin D-handle lat pulldown': { w: 60, e1rm: 85 },
}

/** Weekly e1RM gain as a fraction; small and steady, like a trained upper body. */
const WEEKLY_GAIN = 0.01

const iso = ms => new Date(ms).toISOString().slice(0, 10)
const weekday = ms => new Date(ms).getUTCDay()
const round = v => Math.round(v * 10) / 10

const ZERO_LOAD_CAPACITY = 30

/** Reps a lifter can manage at a load, from Epley inverted, never below 0. */
const capacity = (e1rm, w) => (w <= 0 ? ZERO_LOAD_CAPACITY : Math.max(0, Math.floor(epleyReps(e1rm, w) ?? 0)))

/**
 * Build a profile holding the plan and a generated Training log.
 *
 * @param {Object} opts
 * @param {string} [opts.start='2026-09-07'] - A Monday; the first training day.
 * @param {number} [opts.weeks=8] - Weeks to generate.
 * @param {(ctx: Object) => Object|null} [opts.day] - Per-day hook. Return null to skip the day, or
 *   `{ setsFactor, strength, only, ceiling, gain }` to change it: `setsFactor` scales planned sets
 *   (min 1), `dropSets` removes that many sets per exercise (min 2 left), `strength` scales e1RM
 *   for the day, `only` keeps the first N exercises, `ceiling` caps load and `gain` overrides
 *   weekly gain, both keyed by catalogue id or custom exercise name.
 * @param {Object} [opts.lifter] - Overrides for the made-up lifter, keyed like `ceiling`.
 * @returns {Object} Profile state with routines, week, customEx, workouts and bodyweight.
 */
function mustAct(S, command, d) {
  const res = act(S, command)
  if (!res.ok) throw new Error(`generateHistory: ${command.type} was refused on ${d}`)
  return res
}

export function generateHistory({ start = '2026-09-07', weeks = 8, day = () => ({}), lifter = {} } = {}) {
  const S = { unit: 'kg', restSec: 90, routines: [], week: {}, dayPlan: {}, customEx: [], workouts: [], bodyweight: [] }
  applyHypertrophyPlan(S)
  registerCustom(S.customEx)
  const nameOf = id => S.customEx.find(c => c.id === id)?.n
  const byKey = (map, id) => map[id] ?? map[nameOf(id)]
  const profile = id => byKey(lifter, id) || byKey(LIFTER, id)
  const t0 = Date.parse(`${start}T00:00:00Z`)
  let n = 0

  for (let i = 0; i < weeks * 7; i++) {
    const ms = t0 + i * DAY_MS
    const d = iso(ms)
    const week = Math.floor(i / 7)
    recordWeighIn(S, { d, w: round(BODYWEIGHT + 0.2 * (i / 7) + ((i * 7) % 5 - 2) * 0.1) })
    const routineId = S.week[weekday(ms)]
    if (!routineId) continue
    const opts = day({ d, week, routineId, routine: S.routines.find(r => r.id === routineId) })
    if (opts === null) continue
    const { setsFactor = 1, dropSets = 0, strength = 1, only, ceiling = {}, gain = {} } = opts || {}

    mustAct(S, { type: 'begin', routineId }, d)
    const A = S.active
    Object.assign(A, { id: `w${++n}`, d, start: ms + 18 * 3600000 })
    if (only != null) A.entries = A.entries.slice(0, only)
    A.entries.forEach(entry => {
      const p = profile(entry.id)
      const work = entry.sets.filter(isWorkSet)
      const keep = dropSets ? Math.max(2, work.length - dropSets) : Math.max(1, Math.round(work.length * setsFactor))
      const rate = byKey(gain, entry.id) ?? WEEKLY_GAIN
      const e1rm = p.e1rm * (1 + rate * week) * strength
      const cap = byKey(ceiling, entry.id) ?? Infinity
      const side = isPerSide(entry.target) ? 2 : 1
      const top = entry.target.reps
      const linear = entry.target.prog === 'linear'
      let kept = 0
      entry.sets = entry.sets.filter(s => !isWorkSet(s) || kept++ < keep).map((s, k) => {
        if (!isWorkSet(s)) return s
        const w = Math.min(cap, s.w > 0 ? s.w : p.w)
        const load = p.bw ? w + BODYWEIGHT : w
        const max = p.bw ? (e1rm + BODYWEIGHT) : e1rm
        const fresh = capacity(max, load) - k
        const asked = Math.round((linear ? s.r : top) / side)
        const perSide = Math.max(1, Math.min(asked, fresh - 1))
        return { ...s, w, r: perSide * side, done: true, rir: Math.max(0, fresh - perSide) }
      })
    })
    mustAct(S, { type: 'finish' }, d).result.workout.end = ms + 19 * 3600000
  }
  return S
}

/** Every logged Entry for one exercise in one Routine, oldest first. */
export function entriesOf(S, routineName, exIdOrName, nth = 0) {
  const routine = S.routines.find(r => r.name === routineName)
  const id = S.customEx.find(c => c.n === exIdOrName)?.id || exIdOrName
  return S.workouts
    .filter(w => w.routineId === routine.id)
    .map(w => w.entries.filter(e => e.id === id)[nth])
    .filter(Boolean)
}
