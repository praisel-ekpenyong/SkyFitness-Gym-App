import { describe, it, expect } from 'vitest'
import { modeOf, isTimed, defaultConfig, buildSets, freestyleConfig, bestWeightForEntry, isBw, isPerSide, sideReps, repStep, cascadeWeight, insertWarmupRow, removeRowAt, workSetsDone, isWorkSet, isPerformed, workSets, doneWorkSets, hasWork, isExerciseDone, sessionProgress, seedForReplacement, cleanNote } from './workout-model.js'
import { fmtSec, setLabel, exLine } from './format.js'
import { effortOf, stepEffort, capEffort } from './effort.js'
import { pairAdjacent, unpairSuperset, supersetUnits } from './supersetFlow.js'
import { EXDB } from './exercises.js'

const CARDIO = EXDB.find(e => e.bp === 'cardio').id
const LIFT = EXDB.find(e => e.bp !== 'cardio' && e.eq !== 'body weight').id
const BW = EXDB.find(e => e.eq === 'body weight').id

describe('modeOf', () => {
  it('falls back to the body part when a plan has no mode — every existing plan keeps working', () => {
    expect(modeOf({ id: CARDIO })).toBe('cardio')
    expect(modeOf({ id: LIFT })).toBe('reps')
    expect(modeOf({ id: 'no-such-exercise' })).toBe('reps')
    expect(modeOf({})).toBe('reps')
    expect(modeOf(null)).toBe('reps')
    expect(modeOf(undefined)).toBe('reps')
  })

  it('lets an explicit mode win over the body part', () => {
    expect(modeOf({ id: LIFT, mode: 'time' })).toBe('time')
    expect(modeOf({ id: CARDIO, mode: 'reps' })).toBe('reps')
    expect(modeOf({ id: CARDIO, mode: 'time' })).toBe('time')
  })

  it('ignores a mode it does not know rather than trusting a bad file', () => {
    expect(modeOf({ id: LIFT, mode: 'nonsense' })).toBe('reps')
    expect(modeOf({ id: CARDIO, mode: '' })).toBe('cardio')
  })

  it('exposes the timed check', () => {
    expect(isTimed({ id: LIFT, mode: 'time' })).toBe(true)
    expect(isTimed({ id: LIFT })).toBe(false)
  })
})

describe('fmtSec', () => {
  it('reads as a clock, not a pile of seconds', () => {
    expect(fmtSec(0)).toBe('0:00')
    expect(fmtSec(9)).toBe('0:09')
    expect(fmtSec(45)).toBe('0:45')
    expect(fmtSec(60)).toBe('1:00')
    expect(fmtSec(90)).toBe('1:30')
    expect(fmtSec(605)).toBe('10:05')
  })
  it('is defensive about junk input', () => {
    expect(fmtSec(-5)).toBe('0:00')
    expect(fmtSec(undefined)).toBe('0:00')
    expect(fmtSec(null)).toBe('0:00')
    expect(fmtSec(NaN)).toBe('0:00')
    expect(fmtSec(44.6)).toBe('0:45')
  })
})

describe('setLabel', () => {
  it('describes each mode in its own terms', () => {
    expect(setLabel(LIFT, { w: 60, r: 10 })).toBe('60×10')
    expect(setLabel(CARDIO, { min: 20, speed: 9 })).toBe('20 min @ 9 km/h')
    expect(setLabel(LIFT, { sec: 45, w: 0 }, { mode: 'time' })).toBe('0:45')
    expect(setLabel(LIFT, { sec: 90, w: 20 }, { mode: 'time' })).toBe('1:30 · 20')
  })

  it('reads a legacy set with no config exactly as before', () => {
    expect(setLabel(LIFT, { w: 0, r: 0 })).toBe('0×0')
    expect(setLabel(CARDIO, {})).toBe('0 min @ 0 km/h')
  })

  it('appends RIR when present, including a valid 0', () => {
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 2 })).toBe('60×10 (RIR 2)')
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 1.5 })).toBe('60×10 (RIR 1.5)')
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 0 })).toBe('60×10 (RIR 0)')
  })

  it('says nothing about RIR on a set that never logged one', () => {
    expect(setLabel(LIFT, { w: 60, r: 10 })).toBe('60×10')
    expect(setLabel(LIFT, { w: 60, r: 10, rir: null })).toBe('60×10')
  })

  it('appends RPE for a set logged on that scale', () => {
    expect(setLabel(LIFT, { w: 60, r: 10, rpe: 8 })).toBe('60×10 (RPE 8)')
    expect(setLabel(LIFT, { w: 60, r: 10, rpe: 9.5 })).toBe('60×10 (RPE 9.5)')
    expect(setLabel(LIFT, { w: 60, r: 10, rpe: null })).toBe('60×10')
  })

  it('keeps each set on the scale it was logged with', () => {
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 2 })).toBe('60×10 (RIR 2)')
    expect(setLabel(LIFT, { w: 60, r: 10, rir: 2, rpe: 8 })).toBe('60×10 (RIR 2)')
  })
})

describe('effortOf', () => {
  it('reads the scale a profile logs', () => {
    expect(effortOf({ effort: 'rpe' })).toBe('rpe')
    expect(effortOf({ effort: 'rir' })).toBe('rir')
    expect(effortOf({ effort: 'none' })).toBe('none')
    expect(effortOf({})).toBe('none')
    expect(effortOf({ effort: null })).toBe('none')
  })

  it('is not fooled by a junk value', () => {
    expect(effortOf({ effort: 'rpe10' })).toBe('none')
    expect(effortOf({ effort: 'RIR' })).toBe('none')
    expect(effortOf({ effort: 'f' })).toBe('none')
    expect(effortOf(null)).toBe('none')
    expect(effortOf(undefined)).toBe('none')
    expect(effortOf({ effort: 'nope' })).toBe('none')
  })
})

describe('stepEffort', () => {
  it('starts at the bottom of the scale and walks up', () => {
    expect(stepEffort('rir', null, 1)).toBe(0)
    expect(stepEffort('rpe', null, 1)).toBe(6)
    expect(stepEffort('rir', 0, 1)).toBe(0.5)
    expect(stepEffort('rir', 0.5, 1)).toBe(1)
    expect(stepEffort('rpe', 6, 1)).toBe(6.5)
  })

  it('leaves an untouched cell unlogged when stepped down', () => {
    expect(stepEffort('rir', null, -1)).toBe(null)
    expect(stepEffort('rpe', null, -1)).toBe(null)
    expect(stepEffort('rir', undefined, -1)).toBe(null)
  })

  it('clears the cell again when stepped back off the floor', () => {
    expect(stepEffort('rir', 0, -1)).toBe(null)
    expect(stepEffort('rpe', 6, -1)).toBe(null)
    expect(stepEffort('rir', 0.5, -1)).toBe(0)
    expect(stepEffort('rpe', 6.5, -1)).toBe(6)
  })

  it('stops at the top of the scale', () => {
    expect(stepEffort('rir', 9.5, 1)).toBe(10)
    expect(stepEffort('rir', 10, 1)).toBe(10)
    expect(stepEffort('rpe', 10, 1)).toBe(10)
  })

  it('keeps halves clean instead of drifting into float dust', () => {
    let v = null
    for (let i = 0; i < 6; i++) v = stepEffort('rpe', v, 1)
    expect(v).toBe(8.5)
    expect(stepEffort('rir', 0.1 + 0.2, 1)).toBe(0.8)
  })

  it('steps evenly from a value typed below the floor rather than snapping', () => {
    expect(stepEffort('rpe', 3, 1)).toBe(3.5)
    expect(stepEffort('rpe', 3, -1)).toBe(null)
  })

  it('does nothing when the profile logs no effort at all', () => {
    expect(stepEffort('none', null, 1)).toBe(null)
    expect(stepEffort('none', 2, 1)).toBe(2)
    expect(stepEffort(undefined, 2, -1)).toBe(2)
  })
})

describe('capEffort', () => {
  it('caps a typed value at the top of the scale', () => {
    expect(capEffort('rir', 12)).toBe(10)
    expect(capEffort('rpe', 99)).toBe(10)
    expect(capEffort('rpe', 8)).toBe(8)
  })

  it('does not floor a typed value, so typing "10" survives its first keystroke', () => {
    expect(capEffort('rpe', 1)).toBe(1)
    expect(capEffort('rir', 0)).toBe(0)
  })

  it('passes an emptied field through untouched', () => {
    expect(capEffort('rir', null)).toBe(null)
    expect(capEffort('rpe', undefined)).toBe(undefined)
    expect(capEffort('none', 12)).toBe(12)
  })
})

describe('logging effort across a session', () => {
  it('logs a working set on the chosen scale', () => {
    let v = null
    for (let i = 0; i < 4; i++) v = stepEffort('rpe', v, 1)
    expect(setLabel(LIFT, { w: 80, r: 5, rpe: v })).toBe('80×5 (RPE 7.5)')
  })

  it('a set taken to failure is logged, not left blank', () => {
    const v = stepEffort('rir', null, 1)
    expect(v).toBe(0)
    expect(setLabel(LIFT, { w: 100, r: 3, rir: v })).toBe('100×3 (RIR 0)')
  })

  it('switching the setting mid-history rewrites nothing', () => {
    const old = { w: 60, r: 10, rir: 2 }
    const fresh = { w: 60, r: 10, rpe: 8 }
    expect(effortOf({ effort: 'rpe' })).toBe('rpe')
    expect(setLabel(LIFT, old)).toBe('60×10 (RIR 2)')
    expect(setLabel(LIFT, fresh)).toBe('60×10 (RPE 8)')
    expect(effortOf({ effort: 'none' })).toBe('none')
    expect(setLabel(LIFT, old)).toBe('60×10 (RIR 2)')
  })

  it('never attaches effort to a mode that has no place for it', () => {
    expect(setLabel(CARDIO, { min: 20, speed: 9, rpe: 8 })).toBe('20 min @ 9 km/h')
    expect(setLabel(LIFT, { sec: 45, rir: 2 }, { id: LIFT, mode: 'time' })).toBe('0:45')
  })
})

describe('defaultConfig', () => {
  it('gives each mode a sensible starting point', () => {
    expect(defaultConfig(LIFT)).toEqual({ sets: 3, reps: 10, weight: 0, mode: 'reps' })
    expect(defaultConfig(CARDIO)).toEqual({ sets: 1, min: 20, speed: 8 })
    expect(defaultConfig(LIFT, 'time')).toEqual({ sets: 3, sec: 45, weight: 0, mode: 'time' })
  })
  it('seeds the bodyweight flag from the catalogue, and only when it is true', () => {
    expect(defaultConfig(BW)).toEqual({ sets: 3, reps: 10, weight: 0, mode: 'reps', bodyweight: true })
    expect(defaultConfig(BW, 'time')).toEqual({ sets: 3, sec: 45, weight: 0, mode: 'time', bodyweight: true })
    expect('bodyweight' in defaultConfig(LIFT)).toBe(false)
  })
})


describe('isBw', () => {
  it('defaults from the catalogue so an existing plan needs no flag', () => {
    expect(isBw({ id: BW })).toBe(true)
    expect(isBw({ id: LIFT })).toBe(false)
  })
  it('lets the config win in both directions — a belt on a dip, a flag on a machine', () => {
    expect(isBw({ id: BW, bodyweight: false })).toBe(false)
    expect(isBw({ id: LIFT, bodyweight: true })).toBe(true)
  })
})

describe('sideReps', () => {
  it('halves the logged total, because the total is what was logged', () => {
    expect(sideReps(16)).toBe(8)
    expect(sideReps(0)).toBe(0)
  })
  it('shows an odd total as it falls rather than rounding the imbalance away', () => {
    expect(sideReps(17)).toBe(8.5)
  })
})

describe('exLine — per side never reaches a timed hold', () => {
  it('ignores a stale side flag on a hold, which has no reps to split', () => {
    expect(exLine({ id: LIFT, sets: 3, sec: 45, mode: 'time', side: true }, 'kg')).toBe('3 × 0:45')
  })
})

describe('repStep', () => {
  it('steps unilateral work in twos so the total stays splittable', () => {
    expect(repStep({ side: true })).toBe(2)
    expect(repStep({})).toBe(1)
    expect(repStep(null)).toBe(1)
  })
})

describe('setLabel — bodyweight', () => {
  it('reads as reps alone, because "0×12" describes nothing', () => {
    expect(setLabel(BW, { w: 0, r: 12 }, { id: BW })).toBe('12')
  })
  it('spells out a belt as an addition', () => {
    expect(setLabel(BW, { w: 10, r: 8 }, { id: BW })).toBe('+10 × 8')
  })
  it('logs a per-side set as the plain total, like every other set in the app', () => {
    expect(setLabel(BW, { w: 0, r: 16 }, { id: BW, side: true })).toBe('16')
    expect(setLabel(LIFT, { w: 20, r: 16 }, { id: LIFT, side: true })).toBe('20×16')
  })
  it('keeps the effort tail', () => {
    expect(setLabel(BW, { w: 0, r: 12, rir: 2 }, { id: BW })).toBe('12 (RIR 2)')
  })
})

describe('exLine', () => {
  it('shows the split where there is room for it, next to the total you log', () => {
    expect(exLine({ id: LIFT, sets: 3, reps: 16, side: true }, 'kg')).toBe('3 × 16 · 8/side')
  })
  it('marks added weight as added', () => {
    expect(exLine({ id: BW, sets: 3, reps: 8, weight: 10 }, 'kg')).toBe('3 × 8 · +10 kg')
  })
  it('summarises a planned exercise per mode', () => {
    expect(exLine({ id: LIFT, sets: 3, reps: 10 }, 'kg')).toBe('3 × 10')
    expect(exLine({ id: LIFT, sets: 3, reps: 10, weight: 60 }, 'kg')).toBe('3 × 10 · 60 kg')
    expect(exLine({ id: LIFT, sets: 3, sec: 45, mode: 'time' }, 'kg')).toBe('3 × 0:45')
    expect(exLine({ id: LIFT, sets: 2, sec: 90, weight: 20, mode: 'time' }, 'kg')).toBe('2 × 1:30 · 20 kg')
    expect(exLine({ id: CARDIO, sets: 1, min: 20, speed: 8 }, 'kg')).toBe('1 × 20 min @ 8 km/h')
  })
})

const emptyS = { workouts: [], exWeights: {} }

describe('freestyleConfig', () => {
  it('inherits the last target and completed set count for a newly added exercise', () => {
    const S = {
      exWeights: {},
      workouts: [{
        d: '2026-01-01',
        entries: [{
          id: LIFT,
          target: { mode: 'reps', sets: 4, reps: 8, weight: 60, prog: 'linear' },
          sets: [
            { w: 60, r: 8, done: true },
            { w: 62.5, r: 7, done: true },
            { w: 62.5, r: 6, done: true },
            { w: 62.5, r: 5, done: true }
          ]
        }]
      }]
    }
    const cfg = freestyleConfig(S, { id: LIFT, mode: 'reps', sets: 3, reps: 10, weight: 0 })

    expect(cfg).toEqual({ id: LIFT, mode: 'reps', sets: 4, reps: 8, weight: 60, prog: 'linear' })
    expect(buildSets(S, cfg)).toEqual([
      { w: 62.5, r: 8, done: false },
      { w: 62.5, r: 7, done: false },
      { w: 62.5, r: 6, done: false },
      { w: 62.5, r: 5, done: false }
    ])
  })

  it('inherits the target for timed and cardio exercises too', () => {
    const timed = {
      exWeights: {},
      workouts: [{
        d: '2026-01-02',
        entries: [{
          id: LIFT,
          target: { mode: 'time', sets: 2, sec: 60, weight: 15 },
          sets: [{ sec: 55, w: 15, done: true }, { sec: 60, w: 17.5, done: true }]
        }]
      }]
    }
    const cardio = {
      exWeights: {},
      workouts: [{
        d: '2026-01-03',
        entries: [{
          id: CARDIO,
          target: { sets: 2, min: 30, speed: 7 },
          sets: [{ min: 28, speed: 7, done: true }, { min: 30, speed: 7.5, done: true }]
        }]
      }]
    }

    const timedCfg = freestyleConfig(timed, { id: LIFT, mode: 'time', sets: 3, sec: 45, weight: 0 })
    expect(timedCfg).toEqual({ id: LIFT, mode: 'time', sets: 2, sec: 60, weight: 15 })
    expect(buildSets(timed, timedCfg)).toEqual([
      { sec: 55, w: 15, done: false },
      { sec: 60, w: 17.5, done: false }
    ])

    const cardioCfg = freestyleConfig(cardio, { id: CARDIO, sets: 1, min: 20, speed: 8 })
    expect(cardioCfg).toEqual({ id: CARDIO, sets: 2, min: 30, speed: 7 })
    expect(buildSets(cardio, cardioCfg)).toEqual([
      { min: 28, speed: 7, done: false },
      { min: 30, speed: 7.5, done: false }
    ])
  })

  it('keeps the supplied defaults when there is no completed matching workout', () => {
    const cfg = freestyleConfig(emptyS, { id: LIFT, mode: 'reps', sets: 3, reps: 10, weight: 50 })
    expect(cfg).toEqual({ id: LIFT, mode: 'reps', sets: 3, reps: 10, weight: 50 })
  })
})

describe('buildSets', () => {
  it('builds reps sets from the plan when there is no history', () => {
    expect(buildSets(emptyS, { id: LIFT, sets: 3, reps: 8, weight: 50 }))
      .toEqual([{ w: 50, r: 8, done: false }, { w: 50, r: 8, done: false }, { w: 50, r: 8, done: false }])
  })

  it('builds timed sets, carrying the planned duration and load', () => {
    expect(buildSets(emptyS, { id: LIFT, mode: 'time', sets: 2, sec: 60, weight: 20 }))
      .toEqual([{ sec: 60, w: 20, done: false }, { sec: 60, w: 20, done: false }])
  })

  it('builds cardio sets unchanged', () => {
    expect(buildSets(emptyS, { id: CARDIO, sets: 1, min: 25, speed: 9 }))
      .toEqual([{ min: 25, speed: 9, done: false }])
  })

  it('carries last time\'s numbers forward within the same mode', () => {
    const S = { exWeights: {}, workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, target: { mode: 'time' }, sets: [{ sec: 70, w: 10, done: true }] }] }] }
    expect(buildSets(S, { id: LIFT, mode: 'time', sets: 2, sec: 45, weight: 0 }))
      .toEqual([{ sec: 70, w: 10, done: false }, { sec: 70, w: 10, done: false }])
  })

  it('does not seed a duration from a rep count when an exercise switches to time', () => {
    const S = { exWeights: {}, workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, sets: [{ w: 60, r: 10, done: true }] }] }] }
    expect(buildSets(S, { id: LIFT, mode: 'time', sets: 1, sec: 45, weight: 0 }))
      .toEqual([{ sec: 45, w: 0, done: false }])
  })

  it('does not seed reps from a timed set when an exercise switches back', () => {
    const S = { exWeights: {}, workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, target: { mode: 'time' }, sets: [{ sec: 70, w: 10, done: true }] }] }] }
    expect(buildSets(S, { id: LIFT, mode: 'reps', sets: 1, reps: 8, weight: 40 }))
      .toEqual([{ w: 10, r: 8, done: false }])
  })

  it('still prefers the confirmed working weight for reps sets', () => {
    const S = { workouts: [
      { d: '2025-12-01', entries: [{ id: LIFT, sets: [{ w: 75, r: 5, done: true }] }] },
      { d: '2026-01-01', entries: [{ id: LIFT, sets: [{ w: 60, r: 10, done: true }] }] },
    ] }
    expect(buildSets(S, { id: LIFT, sets: 1, reps: 8, weight: 50 })).toEqual([{ w: 75, r: 10, done: false }])
  })

  it('can preserve each last set weight for freestyle instead of using the working-weight hint', () => {
    const S = { exWeights: { [LIFT]: { w: 75 } }, workouts: [{ d: '2026-01-01', entries: [{ id: LIFT, sets: [
      { w: 60, r: 10, done: true }, { w: 62.5, r: 8, done: true }
    ] }] }] }
    expect(buildSets(S, { id: LIFT, sets: 2, reps: 8, weight: 50 }, { preferLast: true }))
      .toEqual([{ w: 60, r: 10, done: false }, { w: 62.5, r: 8, done: false }])
  })

  it('leaves another Routine\'s heavier lift out of a routine-backed session', () => {
    const S = {
      exWeights: { [LIFT]: { w: 90 } },
      workouts: [{ d: '2026-01-01', routineId: 'other', entries: [{ id: LIFT, target: { sets: 1, weight: 50 }, sets: [
        { w: 90, r: 10, done: true }
      ] }] }]
    }
    expect(buildSets(S, { id: LIFT, sets: 1, reps: 8, weight: 50 }, { routineId: 'r1' }))
      .toEqual([{ w: 50, r: 8, done: false }])
  })

  it('reads the working-weight hint only when the session has no Routine behind it', () => {
    const S = {
      workouts: [
        { d: '2025-12-01', routineId: 'other', entries: [{ id: LIFT, sets: [{ w: 75, r: 5, done: true }] }] },
        { d: '2026-01-01', routineId: 'other', entries: [{ id: LIFT, target: { sets: 1, weight: 50 }, sets: [
          { w: 60, r: 10, done: true }
        ] }] },
      ]
    }
    expect(buildSets(S, { id: LIFT, sets: 1, reps: 8, weight: 50 }))
      .toEqual([{ w: 75, r: 10, done: false }])
    expect(buildSets(S, { id: LIFT, sets: 1, reps: 8, weight: 50 }, { routineId: 'r1' }))
      .toEqual([{ w: 50, r: 8, done: false }])
  })

  it('carries the Routine\'s own working weight onto a new stream, at the plan\'s top reps', () => {
    const S = {
      exWeights: {},
      workouts: [{ d: '2026-01-01', routineId: 'r1', entries: [{ id: LIFT, target: { sets: 1, reps: 8, weight: 50 }, sets: [
        { w: 60, r: 10, done: true }
      ] }] }]
    }
    expect(buildSets(S, { id: LIFT, sets: 1, reps: 12, weight: 50 }, { routineId: 'r1', seedWeightOnly: true }))
      .toEqual([{ w: 60, r: 12, done: false }])
  })

  it('carries the Routine\'s working weight onto a new timed stream but not the old duration', () => {
    const S = {
      exWeights: {},
      workouts: [{ d: '2026-01-01', routineId: 'r1', entries: [{ id: LIFT, target: { mode: 'time', sets: 1, sec: 45, weight: 20 }, sets: [
        { sec: 30, w: 20, done: true }
      ] }] }]
    }
    expect(buildSets(S, { id: LIFT, mode: 'time', sets: 1, sec: 60, weight: 20 }, { routineId: 'r1', seedWeightOnly: true }))
      .toEqual([{ sec: 60, w: 20, done: false }])
  })
})

describe('workSetsDone and bestWeightForEntry', () => {
  it('recognizes both warm-up schemas in work-set counts', () => {
    const w = {
      unit: 'kg',
      entries: [{
        id: LIFT,
        unit: 'kg',
        sets: [
          { warmup: true, unit: 'kg', w: 20, r: 5, done: true },
          { phase: 'warmup', unit: 'kg', w: 30, r: 5, done: true },
          { phase: 'work', unit: 'kg', w: 60, r: 5, done: true },
        ],
      }],
    }
    expect(workSetsDone(w)).toBe(1)
  })

  it('uses completed non-warm-up load for timed entries', () => {
    expect(bestWeightForEntry({ target: { mode: 'time' }, topW: 200, sets: [
      { phase: 'warmup', sec: 30, w: 30, done: true },
      { phase: 'work', sec: 60, w: 20, done: true },
      { phase: 'work', sec: 75, w: 25, done: true },
      { phase: 'work', sec: 90, w: 40, done: false },
    ] })).toBe(25)
  })
})

describe('the work-set readings — one home for phase and performed', () => {
  it('isWorkSet reads the phase: both warm-up schemas excluded, a missing phase reads as work', () => {
    expect(isWorkSet({ phase: 'warmup' })).toBe(false)
    expect(isWorkSet({ warmup: true })).toBe(false)
    expect(isWorkSet({ phase: 'work' })).toBe(true)
    expect(isWorkSet({})).toBe(true)
  })

  it('isPerformed is truthy: a hand-edited done: 1 counts, false/0/absent do not', () => {
    expect(isPerformed({ done: true })).toBe(true)
    expect(isPerformed({ done: 1 })).toBe(true)
    expect(isPerformed({ done: false })).toBe(false)
    expect(isPerformed({ done: 0 })).toBe(false)
    expect(isPerformed({})).toBe(false)
  })

  it('workSets keeps unticked work rows and drops warm-ups; doneWorkSets keeps performed work rows only', () => {
    const entry = { sets: [
      { w: 20, done: true, phase: 'warmup' },
      { w: 60, done: false },
      { w: 80, done: true, phase: 'work' },
    ] }
    expect(workSets(entry).map(s => s.w)).toEqual([60, 80])
    expect(doneWorkSets(entry).map(s => s.w)).toEqual([80])
    expect(workSets(null)).toEqual([])
    expect(doneWorkSets(undefined)).toEqual([])
  })
})

describe('superset editing', () => {
  it('pairs adjacent entries without mutating the source and keeps the display units contiguous', () => {
    const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const paired = pairAdjacent(entries, 1, 2, 'sg-new')

    expect(paired).toEqual([{ id: 'a' }, { id: 'b', sg: 'sg-new' }, { id: 'c', sg: 'sg-new' }])
    expect(entries).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    expect(supersetUnits(paired)).toEqual([[0], [1, 2]])
  })

  it('merges both contiguous groups when their boundary entries are paired', () => {
    const entries = [
      { id: 'a', sg: 'left' }, { id: 'b', sg: 'left' },
      { id: 'c', sg: 'right' }, { id: 'd', sg: 'right' }
    ]
    const merged = pairAdjacent(entries, 1, 2)

    expect(merged.map(e => e.sg)).toEqual(['left', 'left', 'left', 'left'])
    expect(entries.map(e => e.sg)).toEqual(['left', 'left', 'right', 'right'])
  })

  it('unpairs one entry and removes sg values left without an adjacent partner', () => {
    const entries = [
      { id: 'a', sg: 'group' }, { id: 'b', sg: 'group' }, { id: 'c', sg: 'group' },
      { id: 'd', sg: 'orphan' }
    ]
    const unpaired = unpairSuperset(entries, 1)

    expect(unpaired).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }])
    expect(entries.map(e => e.sg)).toEqual(['group', 'group', 'group', 'orphan'])
  })

  it('rejects a non-adjacent pairing request', () => {
    const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

    expect(() => pairAdjacent(entries, 0, 2, 'sg-invalid')).toThrow(/adjacent/)
    expect(entries).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  })
})

describe('session row helpers', () => {
  it('cascadeWeight propagates to same-flag undone rows and never rewrites done sets', () => {
    const rows = [
      { warmup: true, w: 20, done: true },
      { warmup: true, w: 20, done: false },
      { w: 60, done: true },
      { w: 60, done: false },
      { w: 60, done: false },
    ]
    const next = cascadeWeight(rows, 2, 62.5)
    expect(next[2].w).toBe(60)
    expect(next[3].w).toBe(62.5)
    expect(next[4].w).toBe(62.5)
    expect(next[1].w).toBe(20)
  })

  it('cascadeWeight deleting the weight removes the key from following undone rows only', () => {
    const rows = [
      { w: 60, done: true },
      { w: 60, done: false },
      { w: 60, done: false },
    ]
    const next = cascadeWeight(rows, 0, null)
    expect(next[0].w).toBe(60)
    expect('w' in next[1]).toBe(false)
    expect('w' in next[2]).toBe(false)
  })

  it('insertWarmupRow inserts before the first work row and copies the last warm-up values', () => {
    const rows = [
      { warmup: true, w: 20, r: 8, done: true },
      { warmup: true, w: 30, r: 8, done: false },
      { w: 60, r: 8, done: false },
    ]
    const next = insertWarmupRow(rows, 'reps', { reps: 8 })
    expect(next.length).toBe(4)
    expect(next[2].warmup).toBe(true)
    expect(next[2].w).toBe(30)
    expect(next[3].w).toBe(60)
  })

  it('removeRowAt never empties an entry below one row', () => {
    expect(removeRowAt([{ w: 60 }], 0).length).toBe(1)
    const rows = [{ w: 60 }, { w: 70 }]
    const next = removeRowAt(rows, 0)
    expect(next.length).toBe(1)
    expect(next[0].w).toBe(70)
  })
})

describe('warm-up rows identified by phase alone', () => {
  const imported = { w: 40, r: 10, done: true, phase: 'warmup' }
  const work = { w: 100, r: 5, done: true }

  it('workSetsDone does not count a phase-only warm-up', () => {
    expect(workSetsDone({ entries: [{ sets: [imported, work] }] })).toBe(1)
  })

  it('cascadeWeight keeps phase-only warm-ups in their own lane', () => {
    const rows = [
      { w: 40, r: 10, phase: 'warmup' },
      { w: 45, r: 10, phase: 'warmup' },
      { w: 100, r: 5 },
    ]
    const next = cascadeWeight(rows, 0, 50)
    expect(next[1].w).toBe(50)
    expect(next[2].w).toBe(100)
  })
})

describe('hasWork', () => {
  const warmup = { done: false, phase: 'warmup', warmup: true }

  it('ignores warm-up rows, so prep alone never counts as work left', () => {
    expect(hasWork([{ sets: [warmup, { done: true }, { done: true }] }], 0)).toBe(false)
  })

  it('counts an undone work row', () => {
    expect(hasWork([{ sets: [{ done: true }, { done: false }] }], 0)).toBe(true)
  })

  it('reads an entry with no rows as no work left', () => {
    expect(hasWork([{ sets: [] }], 0)).toBe(false)
  })
  it('reads a missing entry as no work left', () => {
    expect(hasWork([], 3)).toBe(false)
    expect(hasWork([undefined], 0)).toBe(false)
    expect(hasWork(null)).toBe(false)
    expect(hasWork(undefined)).toBe(false)
  })

  it('accepts a single entry directly without requiring an entries array and index', () => {
    expect(hasWork({ sets: [{ done: false }] })).toBe(true)
    expect(hasWork({ sets: [{ done: true }] })).toBe(false)
    expect(hasWork({ sets: [warmup, { done: true }] })).toBe(false)
  })
})

describe('isExerciseDone', () => {
  const warmupDone = { done: true, phase: 'warmup', warmup: true }
  const warmupUndone = { done: false, phase: 'warmup', warmup: true }

  it('returns false for nullish entries', () => {
    expect(isExerciseDone(null)).toBe(false)
    expect(isExerciseDone(undefined)).toBe(false)
  })

  it('counts an entry with no work rows as done — nothing left to do', () => {
    expect(isExerciseDone({ sets: [] })).toBe(true)
    expect(isExerciseDone({ sets: [warmupDone, warmupDone] })).toBe(true)
    expect(isExerciseDone({ sets: [warmupUndone] })).toBe(true)
  })

  it('returns false when work sets remain undone', () => {
    expect(isExerciseDone({ sets: [{ done: true }, { done: false }] })).toBe(false)
    expect(isExerciseDone({ sets: [warmupDone, { done: false }] })).toBe(false)
  })

  it('returns true when all work sets are done, even with unticked warm-up sets', () => {
    expect(isExerciseDone({ sets: [{ done: true }, { done: true }] })).toBe(true)
    expect(isExerciseDone({ sets: [warmupUndone, { done: true }] })).toBe(true)
    expect(isExerciseDone({ sets: [warmupDone, { done: true }] })).toBe(true)
  })
})

describe('sessionProgress', () => {
  const warmupUnticked = { w: 40, r: 5, done: false, phase: 'warmup', warmup: true }
  const work = done => ({ w: 100, r: 8, done })
  const probeSession = () => ({ entries: [{ id: '0025', sets: [warmupUnticked, work(true), work(true)] }] })

  it('counts work sets only, so an unticked warm-up finishes the session', () => {
    expect(sessionProgress(probeSession())).toEqual({
      done: 2, total: 2, remaining: 0, exDone: 1, exTotal: 1, allDone: true,
    })
  })

  it('leaves the session unfinished while a work set is unticked', () => {
    const A = { entries: [{ id: '0025', sets: [warmupUnticked, work(true), work(false)] }] }
    const p = sessionProgress(A)
    expect(p.remaining).toBe(1)
    expect(p.exDone).toBe(0)
    expect(p.allDone).toBe(false)
  })

  it('ticking or adding warm-up rows never moves done or total', () => {
    const base = { entries: [{ id: 'x', sets: [work(false)] }] }
    const warmed = { entries: [{ id: 'x', sets: [{ ...work(true), phase: 'warmup', warmup: true }, work(false)] }] }
    expect(sessionProgress(warmed)).toEqual(sessionProgress(base))
  })

  it('an entry left with only warm-up rows counts as done, so it cannot block finishing', () => {
    const A = {
      entries: [
        { id: 'a', sets: [work(true)] },
        { id: 'b', sets: [{ ...work(true), phase: 'warmup', warmup: true }] },
      ],
    }
    const p = sessionProgress(A)
    expect(p.exDone).toBe(2)
    expect(p.allDone).toBe(true)
  })

  it('reads an empty or missing session as zero progress, not done', () => {
    expect(sessionProgress(null)).toEqual({ done: 0, total: 0, remaining: 0, exDone: 0, exTotal: 0, allDone: false })
    expect(sessionProgress({ entries: [] }).allDone).toBe(false)
  })
})

describe('seedForReplacement', () => {
  it('pre-populates defaultConfig when no history exists and preserves setsCount', () => {
    const S = { workouts: [], exWeights: {} }
    const res = seedForReplacement(S, LIFT, null, 4)
    expect(res).toEqual({
      ...defaultConfig(LIFT),
      sets: 4,
    })
  })

  it('falls back to base.sets if setsCount is nullish', () => {
    const S = { workouts: [], exWeights: {} }
    const base = defaultConfig(LIFT)
    expect(seedForReplacement(S, LIFT, null, null).sets).toBe(base.sets)
    expect(seedForReplacement(S, LIFT, null, undefined).sets).toBe(base.sets)
  })

  it('uses lastEntryFor when no routineId provided', () => {
    const S = {
      workouts: [
        {
          d: '2026-10-01',
          entries: [
            { id: LIFT, target: { reps: 8, weight: 60, sets: 5 }, sets: [{ w: 60, r: 8, done: true }] },
          ],
        },
      ],
      exWeights: {},
    }
    const res = seedForReplacement(S, LIFT, null, 3)
    expect(res.reps).toBe(8)
    expect(res.weight).toBe(60)
    expect(res.sets).toBe(3)
  })

  it('prefers routine-specific history over global history when routineId provided', () => {
    const S = {
      workouts: [
        {
          d: '2026-10-01',
          routineId: 'other-routine',
          entries: [
            { id: LIFT, target: { reps: 5, weight: 100 }, sets: [{ w: 100, r: 5, done: true }] },
          ],
        },
        {
          d: '2026-10-02',
          routineId: 'target-routine',
          entries: [
            { id: LIFT, target: { reps: 12, weight: 70 }, sets: [{ w: 70, r: 12, done: true }] },
          ],
        },
      ],
      exWeights: {},
    }
    const res = seedForReplacement(S, LIFT, 'target-routine', 3)
    expect(res.reps).toBe(12)
    expect(res.weight).toBe(100)
    expect(res.sets).toBe(3)
  })

  it('falls back to global history when routine history is absent', () => {
    const S = {
      workouts: [
        {
          d: '2026-10-01',
          routineId: 'other-routine',
          entries: [
            { id: LIFT, target: { reps: 6, weight: 90 }, sets: [{ w: 90, r: 6, done: true }] },
          ],
        },
      ],
      exWeights: {},
    }
    const res = seedForReplacement(S, LIFT, 'non-existent-routine', 3)
    expect(res.reps).toBe(6)
    expect(res.weight).toBe(90)
    expect(res.sets).toBe(3)
  })

  it('overrides weight with Best when Best > 0 and not bodyweight', () => {
    const S = {
      workouts: [
        {
          d: '2026-10-01',
          entries: [
            { id: LIFT, target: { reps: 10, weight: 50 }, sets: [{ w: 50, r: 10, done: true }] },
          ],
        },
        { d: '2026-10-05', entries: [{ id: LIFT, sets: [{ w: 85, r: 3, done: true }] }] },
      ],
    }
    const res = seedForReplacement(S, LIFT, null, 3)
    expect(res.reps).toBe(10)
    expect(res.weight).toBe(85)
  })

  it('does NOT override weight with Best for bodyweight exercises', () => {
    const S = {
      workouts: [
        {
          d: '2026-10-01',
          entries: [
            { id: BW, target: { reps: 15, weight: 0 }, sets: [{ w: 0, r: 15, done: true }] },
          ],
        },
      ],
      exWeights: {
        [BW]: { w: 20, d: '2026-10-05' },
      },
    }
    const res = seedForReplacement(S, BW, null, 3)
    expect(res.bodyweight).toBe(true)
    expect(res.weight).toBe(0)
  })
})

describe('cleanNote', () => {
  it('trims leading and trailing whitespace', () => {
    expect(cleanNote('  hello world  ')).toBe('hello world')
  })

  it('slices strings longer than 500 characters to 500 characters', () => {
    const long = 'x'.repeat(600)
    const res = cleanNote(long)
    expect(res).toHaveLength(500)
    expect(res).toBe('x'.repeat(500))
  })

  it('returns undefined for empty strings and whitespace-only strings', () => {
    expect(cleanNote('')).toBeUndefined()
    expect(cleanNote('   ')).toBeUndefined()
    expect(cleanNote('\n\t  \n')).toBeUndefined()
  })

  it('returns undefined for non-string inputs', () => {
    expect(cleanNote(null)).toBeUndefined()
    expect(cleanNote(undefined)).toBeUndefined()
    expect(cleanNote(123)).toBeUndefined()
    expect(cleanNote({})).toBeUndefined()
    expect(cleanNote([])).toBeUndefined()
  })
})

