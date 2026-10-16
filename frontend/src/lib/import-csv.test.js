import { describe, expect, it } from 'vitest'
import { parseWorkoutCSV, mergeImport } from './import-csv.js'

const CSV = [
  'Date,Exercise,Weight,Reps,Set Type',
  '2026-08-08,Bench Press,100,5,Warm-up',
  '2026-08-08,Bench Press,80,5,Working',
].join('\n')

describe('CSV warm-up provenance', () => {
  it('retains the imported warm-up phase and excludes it from topW', () => {
    const parsed = parseWorkoutCSV(CSV, { unit: 'kg' })
    const entry = parsed.workouts[0].entries[0]

    expect(parsed.warmups).toBe(1)
    expect(entry.sets).toEqual([
      { w: 100, r: 5, done: true, phase: 'warmup' },
      { w: 80, r: 5, done: true },
    ])
    expect(entry.topW).toBe(80)
  })
})

/* Defensive ingestion: mergeImport must not throw on nullish shapes. */

describe('mergeImport defensive guards', () => {
  it('handles missing workouts and entries without throwing', () => {
    const S1 = {}
    expect(() => mergeImport(S1, { kind: 'workouts', workouts: [{ d: '2026-08-08', entries: null }], customEx: [] })).not.toThrow()
    expect(S1.workouts).toBeDefined()
    const S2 = { workouts: null, customEx: null, bodyweight: [] }
    const parsed2 = { kind: 'workouts', workouts: [{ d: '2026-08-09', entries: [{ id: '0025', sets: [{ w: 60, r: 5, done: true }] }] }], customEx: [] }
    expect(() => mergeImport(S2, parsed2)).not.toThrow()
    expect(S2.workouts.length).toBe(1)
    const S3 = {}
    const parsed3 = { kind: 'workouts', workouts: [{ d: '2026-08-10' }], customEx: [] }
    expect(() => mergeImport(S3, parsed3)).not.toThrow()
  })

  it('handles completely absent S.workouts gracefully', () => {
    const S = { bodyweight: [] }
    const parsed = { kind: 'workouts', workouts: [{ d: '2026-08-11', entries: [{ id: '0025', sets: [{ w: 50, r: 5, done: true }] }] }], customEx: [] }
    expect(() => mergeImport(S, parsed)).not.toThrow()
    expect(S.workouts).toHaveLength(1)
    expect(S.workouts[0].entries).toHaveLength(1)
  })
})

/* Custom-exercise body-part fallback (import-csv.js): an unmatched name becomes a
   custom exercise whose body part is mapped from the file's Category column, with
   cardio signals winning over the 'upper legs' default for strength rows. */

describe('import custom-exercise body-part fallback', () => {
  const byName = parsed => Object.fromEntries(parsed.customEx.map(c => [c.n, c]))

  it('maps known categories onto body parts, case-insensitively', () => {
    const csv = [
      'Date,Exercise,Category,Weight,Reps',
      '2026-08-08,Zzx Qqq Alpha Lift,Chest,80,5',
      '2026-08-08,Zzx Qqq Beta Lift,SHOULDERS,40,8',
      '2026-08-08,Zzx Qqq Gamma Lift,Biceps,30,10',
    ].join('\n')
    const customs = byName(parseWorkoutCSV(csv, { unit: 'kg' }))
    expect(customs['zzx qqq alpha lift'].bp).toBe('chest')
    expect(customs['zzx qqq beta lift'].bp).toBe('shoulders')
    expect(customs['zzx qqq gamma lift'].bp).toBe('upper arms')
  })

  it("falls back to 'upper legs' for an unknown category on a strength row", () => {
    const csv = [
      'Date,Exercise,Category,Weight,Reps',
      '2026-08-08,Zzx Qqq Mystery Lift,Mystery,80,5',
    ].join('\n')
    const customs = byName(parseWorkoutCSV(csv, { unit: 'kg' }))
    const rec = customs['zzx qqq mystery lift']
    expect(rec.bp).toBe('upper legs')
    // the import shape: lower-cased name, empty-string target, no secondary list
    expect(rec.n).toBe('zzx qqq mystery lift')
    expect(rec.tg).toBe('')
    expect(rec.sm).toBeUndefined()
  })

  it("falls back to 'cardio' when the row carries distance", () => {
    const csv = [
      'Date,Exercise,Category,Distance',
      '2026-08-08,Zzx Qqq Cardio Thing,Mystery,5',
    ].join('\n')
    const customs = byName(parseWorkoutCSV(csv, { unit: 'kg' }))
    expect(customs['zzx qqq cardio thing'].bp).toBe('cardio')
  })

  it("falls back to 'cardio' for time without reps", () => {
    const csv = [
      'Date,Exercise,Category,Time',
      '2026-08-08,Zzx Qqq Row Thing,Mystery,30:00',
    ].join('\n')
    const customs = byName(parseWorkoutCSV(csv, { unit: 'kg' }))
    expect(customs['zzx qqq row thing'].bp).toBe('cardio')
  })
})