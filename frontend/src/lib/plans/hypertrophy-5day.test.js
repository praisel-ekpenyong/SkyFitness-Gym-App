import { describe, it, expect } from 'vitest'
import { hypertrophyPlanBundle, applyHypertrophyPlan, REST_COMPOUND } from './hypertrophy-5day.js'
import { parsePlan } from '../plan-share.js'
import { EXIDX, registerCustom } from '../exercises.js'
import { primaryMuscleOf, secondaryMusclesOf } from '../muscles.js'
import { policyFor, nextPrescription } from '../progression.js'
import { isBw } from '../workout-model.js'
import { act } from '../active-workout.js'

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

  it('states the plan’s own numbers wherever Sky’s differ, so the engine can progress them', () => {
    const exOf = (rid, id) => hypertrophyPlanBundle().routines.find(r => r.id === rid).ex.find(e => e.id === id)
    expect(exOf('push', '0025')).toMatchObject({ sets: 3, repsMin: 6, reps: 7 })
    expect(exOf('push', '0025').notes).toMatch(/Plan: 3 × 6–8, up once set 1 reaches 8/)
    expect(exOf('upper', '0178')).toMatchObject({ sets: 3, repsMin: 9, reps: 15 })
    expect(exOf('upper', '0178').notes).toMatch(/Plan: 3 × 10–15/)
    expect(exOf('pull', '0178')).toMatchObject({ sets: 3, repsMin: 9, reps: 14 })
    expect(exOf('pull', '0178').notes).toMatch(/Plan: 3 × 10–15/)
  })

  it('ships no personal data: no starting weight and no name', () => {
    const bundle = hypertrophyPlanBundle()
    bundle.routines.flatMap(r => r.ex).forEach(e => expect(e.weight || 0, e.id).toBe(0))
    expect(JSON.stringify(bundle)).not.toMatch(/james/i)
  })

  it('keeps every loaded exercise out of the bodyweight carve-out, so a different top starts a new stream', () => {
    const S = fresh()
    applyHypertrophyPlan(S)
    registerCustom(S.customEx)
    const loaded = S.routines.flatMap(r => r.ex.filter(e => !isBw(e)).map(cfg => ({ r, cfg })))
    expect(loaded.length).toBeGreaterThan(30)
    loaded.forEach(({ r, cfg }) => {
      const other = { ...cfg, reps: cfg.reps + 1 }
      const entry = { id: cfg.id, target: other, sets: [{ w: 20, r: other.reps, done: true }] }
      const logged = { ...S, workouts: [{ id: 'w1', d: '2026-11-02', routineId: r.id, entries: [entry] }] }
      expect(nextPrescription(logged, cfg, r).kind, `${r.name} ${cfg.id}`).toBe('first')
    })
    registerCustom([])
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
    expect(secondaryMusclesOf(byName('Twin D-handle lat pulldown'))).toEqual(['biceps', 'upper-back'])
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

  it('leaves the Profile\'s Rest duration alone', () => {
    const S = { ...fresh(), restSec: 120 }
    expect(applyHypertrophyPlan(S)).toEqual({ routineIds: expect.any(Array) })
    expect(S.restSec).toBe(120)
    const kept = fresh()
    applyHypertrophyPlan(kept)
    expect(kept.restSec).toBe(90)
  })

  it('declares kg and loads into a lb Profile with lb increments', () => {
    expect(hypertrophyPlanBundle().unit).toBe('kg')
    const kg = fresh()
    applyHypertrophyPlan(kg)
    const lb = { ...fresh(), unit: 'lb' }
    applyHypertrophyPlan(lb)
    const incs = S => S.routines.flatMap(r => r.ex).filter(e => e.inc != null).map(e => e.inc)
    expect(incs(kg).length).toBeGreaterThan(0)
    incs(kg).forEach(i => expect(i).toBe(2.5))
    incs(lb).forEach(i => expect(i).toBe(5.5))
  })

  it('sets each exercise its own Rest duration and keeps rest lines out of the notes', () => {
    const S = fresh()
    applyHypertrophyPlan(S)
    S.routines.flatMap(r => r.ex).forEach(e => {
      expect(e.rest, e.id).toBeGreaterThan(0)
      expect(e.notes, e.id).not.toMatch(/\brest\b/i)
    })
    const squat = S.routines.find(r => r.name === 'Lower').ex[0]
    expect(squat.rest).toBe(REST_COMPOUND)
  })

  it('starts a 180 s rest after a set on a compound lift', () => {
    const S = { ...fresh(), unit: 'kg', workouts: [], bodyweight: [], dayPlan: {} }
    const { routineIds } = applyHypertrophyPlan(S)
    act(S, { type: 'begin', routineId: routineIds[1] })
    const res = act(S, { type: 'toggle', entry: 0, set: 0 })
    expect(res.effects.find(e => e.type === 'rest:start')).toEqual({ type: 'rest:start', sec: 180 })
  })
})
