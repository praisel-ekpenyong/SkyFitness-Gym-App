import { describe, it, expect } from 'vitest'
import { hypertrophyPlanBundle, applyHypertrophyPlan, PLAN_REST_SEC } from './hypertrophy-5day.js'
import { parsePlan } from '../plan-share.js'
import { EXIDX, registerCustom } from '../exercises.js'
import { primaryMuscleOf, secondaryMusclesOf } from '../muscles.js'
import { policyFor } from '../progression.js'

const fresh = () => ({ routines: [], week: {}, customEx: [], restSec: 90 })

describe('5-day hypertrophy bundle', () => {
  it('is a valid Plan file that drops no exercise', () => {
    const parsed = parsePlan(hypertrophyPlanBundle())
    expect(parsed.dropped).toBe(0)
    expect(parsed.routineCount).toBe(5)
    expect(parsed.scheduledDays).toBe(5)
  })

  it('totals 94 working sets a week, as the plan does from week 4 on', () => {
    const perDay = hypertrophyPlanBundle().routines.map(r => r.ex.reduce((n, e) => n + e.sets, 0))
    expect(perDay).toEqual([20, 18, 16, 20, 20])
  })

  it('ships no personal data: every starting weight is zero and no name appears', () => {
    const bundle = hypertrophyPlanBundle()
    bundle.routines.flatMap(r => r.ex).forEach(e => expect(e.weight).toBe(0))
    expect(JSON.stringify(bundle)).not.toMatch(/james/i)
  })

  it('keeps every note inside the 500-character cap', () => {
    hypertrophyPlanBundle().routines.flatMap(r => r.ex).forEach(e => expect(e.notes.length).toBeLessThanOrEqual(500))
  })

  it('states the total-reps target the plan sets for each isolation', () => {
    const notesOf = (rid, i) => hypertrophyPlanBundle().routines.find(r => r.id === rid).ex[i].notes
    expect(notesOf('upper', 5)).toMatch(/total reps reach 38/)
    expect(notesOf('push', 4)).toMatch(/total reps reach 40/)
    expect(notesOf('pull', 3)).toMatch(/total reps reach 41/)
    expect(notesOf('pull', 6)).toMatch(/total reps reach 22/)
    expect(notesOf('legs', 4)).toMatch(/total reps reach 50/)
  })

  it('logs unilateral work as both legs together, at twice the per-leg range', () => {
    const split = hypertrophyPlanBundle().routines.find(r => r.id === 'lower').ex[2]
    expect(split).toMatchObject({ side: true, reps: 24, repsMin: 16 })
  })
})

describe('applyHypertrophyPlan', () => {
  it('adds five routines on Mon, Tue, Thu, Fri and Sat, leaving Wed and Sun free', () => {
    const S = fresh()
    const { routineIds } = applyHypertrophyPlan(S)
    expect(S.routines.map(r => r.name)).toEqual(['Upper', 'Lower', 'Push', 'Pull', 'Legs'])
    expect(S.week).toEqual({ 1: routineIds[0], 2: routineIds[1], 4: routineIds[2], 5: routineIds[3], 6: routineIds[4] })
  })

  it('adds the five custom exercises once, with their muscles readable', () => {
    const S = fresh()
    applyHypertrophyPlan(S)
    expect(S.customEx).toHaveLength(5)
    registerCustom(S.customEx)
    const byName = n => S.customEx.find(c => c.n === n)
    expect(primaryMuscleOf(byName('Deep dumbbell sumo squat'))).toBe('adductors')
    expect(secondaryMusclesOf(byName('Twin D-handle lat pulldown'))).toEqual(expect.arrayContaining(['biceps', 'upper-back', 'deltoids']))
    S.routines.flatMap(r => r.ex).forEach(e => expect(EXIDX[e.id], e.id).toBeDefined())
    registerCustom([])
  })

  it('leaves Wednesday, Sunday and day overrides as they were', () => {
    const S = { ...fresh(), week: { 0: 'r-sun', 3: 'r-wed', 1: 'r-old' }, dayPlan: { '2026-11-18': 'rest' } }
    applyHypertrophyPlan(S)
    expect(S.week[0]).toBe('r-sun')
    expect(S.week[3]).toBe('r-wed')
    expect(S.week[1]).not.toBe('r-old')
    expect(S.dayPlan).toEqual({ '2026-11-18': 'rest' })
  })

  it('reuses custom exercises already in the profile when loaded twice', () => {
    const S = fresh()
    applyHypertrophyPlan(S)
    applyHypertrophyPlan(S)
    expect(S.customEx).toHaveLength(5)
    expect(S.routines).toHaveLength(10)
  })

  it('sets every exercise its own policy: linear for squat and RDL, double for the rest', () => {
    const S = fresh()
    applyHypertrophyPlan(S)
    const all = S.routines.flatMap(r => r.ex.map(e => ({ e, r })))
    const linear = all.filter(({ e, r }) => policyFor(e, r, 'reps') === 'linear').map(({ e }) => e.id)
    expect(linear.sort()).toEqual(['0043', '0085', '0085'])
    all.forEach(({ e, r }) => expect(['linear', 'double']).toContain(policyFor(e, r, 'reps')))
  })

  it('moves the rest timer to 3 minutes only from the factory default', () => {
    const S = fresh()
    expect(applyHypertrophyPlan(S).restChanged).toBe(true)
    expect(S.restSec).toBe(PLAN_REST_SEC)

    const chosen = { ...fresh(), restSec: 120 }
    expect(applyHypertrophyPlan(chosen).restChanged).toBe(false)
    expect(chosen.restSec).toBe(120)
  })
})
