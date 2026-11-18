import { mergePlan } from '../plan-share.js'
import { isBodyweightEq } from '../exercises.js'
import { assignWeekday } from '../schedule.js'

/** Rest the plan asks for between sets; applied only over the factory default. */
export const PLAN_REST_SEC = 180
const FACTORY_REST_SEC = 90

const COMPOUND = 'Rest 3 min. Stop 1–2 reps short of failure.'
const ISO = 'Rest 90–120 s. Take the last set to failure.'
const firstSet = 'Plan rule: go up once set 1 reaches the top and later sets stay in range.'
const totalReps = n => `Plan rule: go up one step once total reps reach ${n} with no set below the range.`
const linear = 'Add load every session while form stays clean; switch to double progression once it stalls.'

/** The plan's own exercises that the catalogue has no honest equivalent for. */
const CUSTOM = [
  { id: 'hyp-bayesian-curl', n: 'Bayesian cable curl', bp: 'upper arms', eq: 'cable', tg: 'biceps', sm: ['forearm'],
    desc: 'Face away from a low pulley, arm drawn behind the body, and curl with the shoulder extended.' },
  { id: 'hyp-incline-db-leg-curl', n: 'Incline lying dumbbell leg curl', bp: 'upper legs', eq: 'dumbbell', tg: 'hamstring', sm: ['calves'],
    desc: 'Lie face down on an incline bench with a dumbbell held between the feet and curl it up.' },
  { id: 'hyp-heel-elevated-db-squat', n: 'Heel-elevated dumbbell squat', bp: 'upper legs', eq: 'dumbbell', tg: 'quadriceps', sm: ['gluteal', 'adductors'],
    desc: 'Heels on a plate, dumbbells at the sides, knees travelling forward into a deep squat.' },
  { id: 'hyp-db-sumo-squat', n: 'Deep dumbbell sumo squat', bp: 'upper legs', eq: 'dumbbell', tg: 'adductors', sm: ['gluteal', 'quadriceps'],
    desc: 'Wide stance with feet on plates, one dumbbell hanging between the legs, sitting below the plates.' },
  { id: 'hyp-twin-d-pulldown', n: 'Twin D-handle lat pulldown', bp: 'back', eq: 'cable', tg: 'lats', sm: ['biceps', 'upper-back'],
    desc: 'Lat pulldown with a separate D-handle in each hand, pulling the elbows down to the sides.' },
]

/**
 * No starting weight. A loaded exercise carries no `weight` at all, as a Plan file export
 * writes it: an explicit 0 is ADR 0011's bodyweight carve-out, which drops the top reps from
 * the Progression stream's shape. Bodyweight exercises keep 0, so they stay in the carve-out.
 */
const noLoad = id => (isBodyweightEq(id) ? { weight: 0 } : {})
const ex = (id, sets, bottom, top, prog, notes, extra = {}) =>
  ({ id, sets, reps: top, repsMin: bottom, ...noLoad(id), prog, notes, ...extra })
const perLeg = (id, sets, bottom, top, notes, extra = {}) =>
  ex(id, sets, bottom * 2, top * 2, 'double', `Reps are both legs together (${bottom}–${top} per leg). ${notes}`, { side: true, ...extra })
const lin = (id, sets, bottom, top, notes) =>
  ({ id, sets, reps: bottom, ...noLoad(id), prog: 'linear', inc: 2.5, notes: `${notes}${notes ? ' ' : ''}Range ${bottom}–${top}. ${COMPOUND} ${linear}` })
const iso = (id, sets, bottom, top, notes = '', extra = {}) =>
  ex(id, sets, bottom, top, 'double', `${notes}${notes ? ' ' : ''}${ISO} ${totalReps(Math.ceil(sets * (bottom + top) / 2))}`, extra)
const comp = (id, sets, bottom, top, notes = '', extra = {}) =>
  ex(id, sets, bottom, top, 'double', `${notes}${notes ? ' ' : ''}${COMPOUND} ${firstSet}`, extra)

const ROUTINES = [
  { id: 'upper', name: 'Upper', emoji: 'figureStrength', ex: [
    comp('0025', 2, 5, 8),
    comp('0652', 2, 6, 10, 'Straps on, dumbbell held between the feet. Add load once both sets reach 10 clean reps.'),
    iso('0238', 2, 10, 15, 'Rope or bar, slight hip hinge, arms nearly straight, full overhead stretch.'),
    iso('0179', 2, 10, 15, 'Low to high.'),
    ex('0861', 3, 10, 12, 'double', `Wide grip, elbows flared. Rest 2 min. ${firstSet}`),
    ex('0178', 3, 8, 15, 'double', `${ISO} Plan: 3 × 10–15, up one step once total reps reach 38 with no set below 10. The bottom here is 8, so climbing back to 10 after a 2.5 kg cable step counts as progress, not a stall.`),
    iso('0194', 3, 10, 15),
    iso('hyp-bayesian-curl', 3, 10, 15),
  ] },
  { id: 'lower', name: 'Lower', emoji: 'legs', ex: [
    lin('0043', 3, 5, 8, 'Full depth.'),
    lin('0085', 3, 6, 10, ''),
    perLeg('0410', 3, 8, 12, `Bulgarian split squat, rear foot on a bench, quad-focused. Rest 2–3 min. ${firstSet}`, { inc: 2.5 }),
    iso('hyp-incline-db-leg-curl', 2, 10, 15, '', { inc: 2.5 }),
    perLeg('0409', 4, 8, 12, `On a step. Rest 90 s. ${totalReps(40)}`, { inc: 2.5 }),
    iso('0175', 3, 10, 15),
  ] },
  { id: 'push', name: 'Push', emoji: 'barbell', ex: [
    comp('0314', 3, 6, 8, 'Bench at about 30°.'),
    ex('0025', 3, 6, 7, 'double', `${COMPOUND} Plan: 3 × 6–8, up once set 1 reaches 8 and later sets stay in range. Sky goes up only when every set reaches the top, so the top here is 7.`),
    ex('0405', 2, 8, 12, 'double', `Rest 2–3 min. ${firstSet}`),
    iso('0178', 4, 10, 15),
    iso('0194', 4, 8, 12, 'If the elbow aches the next day, swap to a single-arm tucked extension.'),
  ] },
  { id: 'pull', name: 'Pull', emoji: 'pullup', ex: [
    comp('hyp-twin-d-pulldown', 3, 6, 10),
    ex('0180', 3, 8, 12, 'double', `Elbows tucked. Rest 2–3 min. ${firstSet}`),
    ex('0327', 3, 8, 12, 'double', `Chest supported on an incline bench, elbows flared. Rest 2–3 min. ${firstSet}`),
    iso('0225', 3, 12, 15, 'Same exercise every week. Rest 90 s.'),
    ex('0178', 2, 10, 15, 'double', `${ISO} Plan: 3 × 10–15, as on Monday, up one step once total reps reach 38 with no set below 10. 2 sets here: with 3, Sky would count Friday's sessions toward Monday's progression.`),
    iso('0318', 3, 8, 12, 'Recline curl: arms hanging behind the body on an incline bench.'),
    iso('0313', 2, 10, 12, 'Rest 90 s.'),
  ] },
  { id: 'legs', name: 'Legs', emoji: 'dumbbell', ex: [
    comp('hyp-heel-elevated-db-squat', 4, 8, 12, 'Once the dumbbells max out, add reps instead of load.', { inc: 2.5 }),
    lin('0085', 2, 8, 12, 'Straps on.'),
    iso('hyp-db-sumo-squat', 3, 10, 20, 'Straps on.', { inc: 2.5 }),
    iso('hyp-incline-db-leg-curl', 3, 10, 15, '', { inc: 2.5 }),
    perLeg('0409', 5, 8, 12, `On a step: deep stretch, 1–2 s pause at the bottom. Rest 90 s. ${totalReps(50)}`, { inc: 2.5 }),
    iso('0175', 3, 10, 15),
  ] },
]

/** Monday Upper, Tuesday Lower, Thursday Push, Friday Pull, Saturday Legs; Wednesday and Sunday rest. */
const WEEK = { 1: 'upper', 2: 'lower', 4: 'push', 5: 'pull', 6: 'legs' }

/**
 * The 5-day hypertrophy plan as a Plan file bundle, ready for `mergePlan`.
 *
 * @returns {Object} A fresh bundle; callers may mutate it.
 */
export function hypertrophyPlanBundle() {
  return structuredClone({ sky_plan: 1, name: '5-day hypertrophy', week: WEEK, routines: ROUTINES, customEx: CUSTOM })
}

/**
 * Add the 5-day plan to a profile: five routines, its custom exercises and its five weekdays.
 * Wednesday, Sunday and day overrides are left as they were. The rest timer moves to 3 minutes
 * only while it is still at the factory default.
 *
 * @param {Object} S - Draft profile state.
 * @returns {{ routineIds: string[], restChanged: boolean }} The new routine ids in plan order, and whether the rest timer changed.
 */
export function applyHypertrophyPlan(S) {
  S.routines ??= []
  S.week ??= {}
  S.customEx ??= []
  const before = new Set(S.routines.map(r => r.id))
  mergePlan(S, hypertrophyPlanBundle())
  const routineIds = S.routines.filter(r => !before.has(r.id)).map(r => r.id)
  const idOf = Object.fromEntries(ROUTINES.map((r, i) => [r.id, routineIds[i]]))
  Object.entries(WEEK).forEach(([day, rid]) => assignWeekday(S, Number(day), idOf[rid]))
  const restChanged = S.restSec == null || S.restSec === FACTORY_REST_SEC
  if (restChanged) S.restSec = PLAN_REST_SEC
  return { routineIds, restChanged }
}
