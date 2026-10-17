// Tests cross the same seam the sheets do after the carve: the full-statement
// cascade that used to be assembled inside the catalogue sheet, pinned at the
// new interface — including the Active-workout refusal that previously had no
// test anywhere (CONTEXT.md: Active workout — at most one exists).
import { describe, it, expect } from 'vitest'
import { toggleFavorite, deleteCustomEx } from './catalogue-writes.js'

const custom = () => ({ id: 'ex-fly', n: 'Homemade fly', bp: 'chest', custom: true })

const baseState = () => ({
  workouts: [
    {
      d: '2026-01-04',
      entries: [
        { id: '0025', sets: [{ w: 60, r: 8, done: true }] },
        { id: 'ex-fly', sets: [{ w: 0, r: 12, done: true }] }
      ]
    },
    {
      d: '2026-01-10',
      entries: [{ id: 'ex-fly', sets: [{ w: 5, r: 10, done: true }], n: 'old stale name', muscleSnapshot: { n: 'keep me' } }]
    }
  ],
  customEx: [custom(), { id: 'ex-row', n: 'Row custom', bp: 'back', custom: true }],
  routines: [
    { id: 'r-push', ex: [{ id: '0025' }, { id: 'ex-fly' }] },
    // the custom sits in a superset pair — retiring it must strand the partner's tag
    { id: 'r-pair', ex: [{ id: '0047', sg: 'ss-1' }, { id: 'ex-fly', sg: 'ss-1' }, { id: '0085' }] }
  ],
  exWeights: { 'ex-fly': { w: 22.5, d: '2026-01-10' }, '0025': { w: 100 } },
  favorites: ['ex-fly', '0025'],
  week: { 1: 'r-push', 3: 'r-pair' },
  dayPlan: { '2026-01-12': 'r-pair' }
})

describe('toggleFavorite', () => {
  it('stars an exercise and returns the new state', () => {
    const S = { favorites: [] }
    expect(toggleFavorite(S, '0025')).toBe(true)
    expect(S.favorites).toEqual(['0025'])
  })

  it('unstars an exercise that is starred and keeps the rest in order', () => {
    const S = { favorites: ['0025', 'ex-fly', '0047'] }
    expect(toggleFavorite(S, 'ex-fly')).toBe(false)
    expect(S.favorites).toEqual(['0025', '0047'])
  })

  it('reads a missing list as empty rather than throwing', () => {
    const S = {}
    expect(toggleFavorite(S, 'ex-fly')).toBe(true)
    expect(S.favorites).toEqual(['ex-fly'])
  })
})

describe('deleteCustomEx — the retire cascade', () => {
  it('stamps the display name into every matching history entry and snapshots muscles once', () => {
    const S = baseState()
    const res = deleteCustomEx(S, custom())

    expect(res).toEqual({ ok: true, reason: null })
    const first = S.workouts[0].entries.find(e => e.id === 'ex-fly')
    expect(first.n).toBe('Homemade fly')
    // chest's body-part weights became the stored snapshot
    expect(Object.keys(first.muscleSnapshot)).toEqual(expect.arrayContaining(['n', 'bp', 'muscleWeights']))
    // the second entry's name is always re-stamped, but its stored snapshot untouched
    const second = S.workouts[1].entries[0]
    expect(second.n).toBe('Homemade fly')
    expect(second.muscleSnapshot).toEqual({ n: 'keep me' })
  })

  it('sweeps the exercise out of customEx, each routine, exWeights and favorites', () => {
    const S = baseState()
    deleteCustomEx(S, custom())

    expect(S.customEx.map(x => x.id)).toEqual(['ex-row'])
    expect(S.routines[0].ex.map(e => e.id)).toEqual(['0025'])
    expect(Object.keys(S.exWeights)).toEqual(['0025'])
    expect(S.favorites).toEqual(['0025'])
  })

  it('dissolves the lone superset tag the sweep strands on the partner entry', () => {
    const S = baseState()
    const r = S.routines[1]
    deleteCustomEx(S, custom())

    // ss-1 held exactly the custom and 0047 side by side; 0047 must lose the tag
    expect(r.ex[0]).toEqual({ id: '0047' })
    expect(r.ex[1].id).toBe('0085')
    expect(r.ex.some(e => e.sg)).toBe(false)
  })

  it('leaves the schedule untouched when a routine loses the entry', () => {
    const S = baseState()
    deleteCustomEx(S, custom())
    expect(S.week).toEqual({ 1: 'r-push', 3: 'r-pair' })
    expect(S.dayPlan).toEqual({ '2026-01-12': 'r-pair' })
  })

  it('refuses while the Active workout holds the exercise and mutates nothing', () => {
    const S = baseState()
    S.active = { entries: [{ id: '0025' }, { id: 'ex-fly', sets: [{ w: 0, r: 12, done: false }] }] }
    const before = JSON.stringify(S)
    const res = deleteCustomEx(S, custom())

    expect(res).toEqual({ ok: false, reason: 'active' })
    expect(JSON.stringify(S)).toBe(before)
  })

  it('tolerates a sparse state — missing collections read as empty', () => {
    const S = { customEx: undefined, workouts: undefined, routines: undefined, exWeights: {}, favorites: undefined }
    expect(() => deleteCustomEx(S, custom())).not.toThrow()
    expect(S.customEx).toEqual([])
    expect(S.favorites).toEqual([])
  })
})
