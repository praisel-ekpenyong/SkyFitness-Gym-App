import { mergePlan } from '../plan-share.js'
import { assignWeekday } from '../schedule.js'

/** Each exercise sets its own Rest duration (ADR 0029), so the plan leaves the Profile's alone. */
export const REST_COMPOUND = 180
export const REST_ISO = 120

const COMPOUND = 'Stop 1–2 reps short of failure.'
const ISO = 'Take the last set to failure.'
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

// No starting weight: a loaded exercise carries no `weight`, as a Plan file export writes it.
const ex = (id, sets, bottom, top, prog, notes, extra = {}) =>
  ({ id, sets, reps: top, repsMin: bottom, prog, notes, rest: REST_COMPOUND, ...extra })
const perLeg = (id, sets, bottom, top, notes, extra = {}) =>
  ex(id, sets, bottom * 2, top * 2, 'double', `Reps are both legs together (${bottom}–${top} per leg). ${notes}`, { side: true, ...extra })
const lin = (id, sets, bottom, top, notes) =>
  ({ id, sets, reps: bottom, prog: 'linear', inc: 2.5, rest: REST_COMPOUND, notes: `${notes}${notes ? ' ' : ''}Range ${bottom}–${top}. ${COMPOUND} ${linear}` })
const iso = (id, sets, bottom, top, notes = '', extra = {}) =>
  ex(id, sets, bottom, top, 'double', `${notes}${notes ? ' ' : ''}${ISO} ${totalReps(Math.ceil(sets * (bottom + top) / 2))}`, { rest: REST_ISO, ...extra })
const comp = (id, sets, bottom, top, notes = '', extra = {}) =>
  ex(id, sets, bottom, top, 'double', `${notes}${notes ? ' ' : ''}${COMPOUND} ${firstSet}`, extra)

const ROUTINES = [
  { id: 'upper', name: 'Upper', emoji: 'figureStrength', ex: [
    comp('0025', 2, 5, 8),
    comp('0652', 2, 6, 10, 'Straps on, dumbbell held between the feet. Add load once both sets reach 10 clean reps.'),
    iso('0238', 2, 10, 15, 'Rope or bar, slight hip hinge, arms nearly straight, full overhead stretch.'),
    iso('0179', 2, 10, 15, 'Low to high.'),
    ex('0861', 3, 10, 12, 'double', `Wide grip, elbows flared. ${firstSet}`, { rest: 120 }),
    ex('0178', 3, 9, 15, 'double', `${ISO} Plan: 3 × 10–15, up one step once total reps reach 38 with no set below 10. The bottom here is 9, so climbing back to 10 after a 2.5 kg cable step counts as progress, not a stall.`, { rest: REST_ISO }),
    iso('0194', 3, 10, 15),
    iso('hyp-bayesian-curl', 3, 10, 15),
  ] },
  { id: 'lower', name: 'Lower', emoji: 'legs', ex: [
    lin('0043', 3, 5, 8, 'Full depth.'),
    lin('0085', 3, 6, 10, ''),
    perLeg('0410', 3, 8, 12, `Bulgarian split squat, rear foot on a bench, quad-focused. ${firstSet}`, { inc: 2.5, rest: 150 }),
    iso('hyp-incline-db-leg-curl', 2, 10, 15, '', { inc: 2.5 }),
    perLeg('0409', 4, 8, 12, `On a step. ${totalReps(40)}`, { inc: 2.5, rest: 90 }),
    iso('0175', 3, 10, 15),
  ] },
  { id: 'push', name: 'Push', emoji: 'barbell', ex: [
    comp('0314', 3, 6, 8, 'Bench at about 30°.'),
    ex('0025', 3, 6, 7, 'double', `${COMPOUND} Plan: 3 × 6–8, up once set 1 reaches 8 and later sets stay in range. Sky goes up only when every set reaches the top, so the top here is 7.`),
    ex('0405', 2, 8, 12, 'double', firstSet, { rest: 150 }),
    iso('0178', 4, 10, 15),
    iso('0194', 4, 8, 12, 'If the elbow aches the next day, swap to a single-arm tucked extension.'),
  ] },
  { id: 'pull', name: 'Pull', emoji: 'pullup', ex: [
    comp('hyp-twin-d-pulldown', 3, 6, 10),
    ex('0180', 3, 8, 12, 'double', `Elbows tucked. ${firstSet}`, { rest: 150 }),
    ex('0327', 3, 8, 12, 'double', `Chest supported on an incline bench, elbows flared. ${firstSet}`, { rest: 150 }),
    iso('0225', 3, 12, 15, 'Same exercise every week.', { rest: 90 }),
    ex('0178', 3, 9, 14, 'double', `${ISO} Plan: 3 × 10–15, as on Monday, up one step once total reps reach 38 with no set below 10. Top 14 here: with Monday's 3 × 15, Sky would count Friday's sessions toward Monday's progression. Bottom 9, as on Monday.`, { rest: REST_ISO }),
    iso('0318', 3, 8, 12, 'Recline curl: arms hanging behind the body on an incline bench.'),
    iso('0313', 2, 10, 12, '', { rest: 90 }),
  ] },
  { id: 'legs', name: 'Legs', emoji: 'dumbbell', ex: [
    comp('hyp-heel-elevated-db-squat', 4, 8, 12, 'Once the dumbbells max out, add reps instead of load.', { inc: 2.5 }),
    lin('0085', 2, 8, 12, 'Straps on.'),
    iso('hyp-db-sumo-squat', 3, 10, 20, 'Straps on.', { inc: 2.5 }),
    iso('hyp-incline-db-leg-curl', 3, 10, 15, '', { inc: 2.5 }),
    perLeg('0409', 5, 8, 12, `On a step: deep stretch, 1–2 s pause at the bottom. ${totalReps(50)}`, { inc: 2.5, rest: 90 }),
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
  return structuredClone({ sky_plan: 1, name: '5-day hypertrophy', unit: 'kg', week: WEEK, routines: ROUTINES, customEx: CUSTOM })
}

/**
 * Add the 5-day plan to a profile: five routines, its custom exercises and its five weekdays.
 * Wednesday, Sunday and day overrides are left as they were. The bundle is in kg; `mergePlan` converts
 * it into the Profile's unit (ADR 0028).
 *
 * @param {Object} S - Draft profile state.
 * @returns {{ routineIds: string[] }} The new routine ids in plan order.
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
  return { routineIds }
}
