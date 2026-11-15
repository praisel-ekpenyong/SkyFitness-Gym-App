import { describe, expect, it } from 'vitest'
import { parseWorkoutCSV } from './import-csv.js'
import { mergePlan } from './plan-share.js'
import { primaryMuscleOf, secondaryMusclesOf, musclesOf } from './muscles.js'


describe('custom-exercise reader compatibility', () => {
  it('resolves an import-built record via the body-part fallback', () => {
    const csv = [
      'Date,Exercise,Category,Weight,Reps',
      '2026-08-08,Zzx Qqq Mystery Lift,Mystery,80,5',
    ].join('\n')
    const [rec] = parseWorkoutCSV(csv, { unit: 'kg' }).customEx

    expect(primaryMuscleOf(rec)).toBe('quadriceps')
    expect(musclesOf(rec)).toEqual({ quadriceps: 0.4, hamstring: 0.35, gluteal: 0.25 })
    expect(secondaryMusclesOf(rec)).toEqual(['hamstring', 'gluteal'])
  })

  it('resolves a plan-share-built record passed through mergePlan', () => {
    const s = { customEx: [], routines: [], week: {} }
    mergePlan(s, {
      customEx: [{ id: 'share1', n: 'Shared Press', bp: 'chest', tg: 'chest', sm: 'triceps', desc: 'Shared desc', eq: 'custom' }],
      routines: [],
      week: {},
    })
    const [rec] = s.customEx

    expect(primaryMuscleOf(rec)).toBe('chest')
    expect(musclesOf(rec)).toEqual({ chest: 1, triceps: 0.4 })
    expect(secondaryMusclesOf(rec)).toEqual(['triceps'])
  })

  it('resolves a catalogue-form-built record with its always-array sm', () => {
    const rec = {
      id: 'ctest1', n: 'Bulgarian Split Squat', bp: 'upper legs',
      tg: 'quadriceps', sm: ['hamstring'], desc: '', eq: 'custom', custom: true,
    }

    expect(primaryMuscleOf(rec)).toBe('quadriceps')
    expect(musclesOf(rec)).toEqual({ quadriceps: 1, hamstring: 0.4 })
    expect(secondaryMusclesOf(rec)).toEqual(['hamstring'])
  })
})
