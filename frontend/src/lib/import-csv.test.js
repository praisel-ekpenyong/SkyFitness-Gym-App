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

/* Import's existing-days-win rule for the Body-weight log: importing twice
   never rewrites a logged reading. Guards the mergeImport -> mergeWeighIns
   delegation against flipping to overwrite. */

describe('mergeImport bodyweight skip rule', () => {
  it('leaves existing days alone and reports added/skipped', () => {
    const S = { bodyweight: [{ d: '2026-01-01', w: 80, t: 1 }] }
    const res = mergeImport(S, {
      kind: 'bodyweight',
      bodyweight: [{ d: '2026-01-01', w: 81, t: 2 }, { d: '2026-01-02', w: 79, t: 3 }],
    })
    expect(res).toEqual({ added: 1, skipped: 1 })
    expect(S.bodyweight).toEqual([
      { d: '2026-01-01', w: 80, t: 1 },
      { d: '2026-01-02', w: 79, t: 3 },
    ])
  })

  it('normalizes a missing bodyweight log instead of throwing', () => {
    const S = {}
    const res = mergeImport(S, { kind: 'bodyweight', bodyweight: [{ d: '2026-01-02', w: 79 }] })
    expect(res).toEqual({ added: 1, skipped: 0 })
    expect(S.bodyweight).toHaveLength(1)
  })
})