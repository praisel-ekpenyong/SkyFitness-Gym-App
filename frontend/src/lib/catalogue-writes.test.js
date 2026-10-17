// Tests cross the same seam the sheets do after the carve: the full-statement
// cascade that used to be assembled inside the catalogue sheet, pinned at the
// new interface — including the Active-workout refusal that previously had no
// test anywhere (CONTEXT.md: Active workout — at most one exists).
// upsertCustomEx is the store-write side of the Custom exercise form: the
// record shape (CONTEXT.md: Custom exercise) and the update-vs-create fork
// used to live inline in the sheet; here they are pinned as one module seam.
import { describe, it, expect } from 'vitest'
import { toggleFavorite, deleteCustomEx, upsertCustomEx } from './catalogue-writes.js'

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

describe("upsertCustomEx — the form's store write", () => {
  it('edits the found entry in place, touching exactly the five fields', () => {
    const S = {
      customEx: [
        { id: 'ex-c', n: 'Old name', tg: 'chest', sm: ['triceps'], bp: 'chest', desc: 'old', eq: 'custom', custom: true },
        { id: 'ex-other', n: 'Untouched', tg: 'abs', sm: [], bp: 'waist', eq: 'custom', custom: true }
      ]
    }
    const entry = S.customEx[0]
    const res = upsertCustomEx(S, { id: 'ex-c', n: 'New name', tg: 'abs', sm: ['obliques'], desc: 'cues' })

    expect(res).toBe('ex-c')
    // the very entry object the store holds is the one mutated
    expect(S.customEx[0]).toBe(entry)
    expect(entry.n).toBe('New name')
    expect(entry.tg).toBe('abs')
    expect(entry.sm).toEqual(['obliques'])
    expect(entry.desc).toBe('cues')
    // record-shape policy lives in the seam: bp re-derived from tg, eq/custom/id untouched
    expect(entry.bp).toBe('waist')
    expect(entry.eq).toBe('custom')
    expect(entry.custom).toBe(true)
    expect(S.customEx[1]).toEqual({ id: 'ex-other', n: 'Untouched', tg: 'abs', sm: [], bp: 'waist', eq: 'custom', custom: true })
    expect(S.customEx).toHaveLength(2)
  })

  it('writes nothing for a stale id (entry already retired elsewhere)', () => {
    const S = { customEx: [{ id: 'ex-other', n: 'Stays', tg: 'abs', sm: [], bp: 'waist', eq: 'custom', custom: true }] }
    const before = JSON.stringify(S)
    const res = upsertCustomEx(S, { id: 'ex-gone', n: 'Whatever', tg: 'chest', sm: [], desc: '' })

    expect(JSON.stringify(S)).toBe(before)
    // the sheet's onDone(EXIDX[id]) still runs with the id it had
    expect(res).toBe('ex-gone')
  })

  it('appends the exact record shape on create and returns the fresh id', () => {
    const S = { customEx: [{ id: 'ex-c', n: 'Existing custom', tg: 'chest', sm: [], bp: 'chest', eq: 'custom', custom: true }] }
    const res = upsertCustomEx(S, { id: null, n: 'Nordic curl', tg: 'hamstring', sm: ['gluteal'], desc: 'slow eccentric' })

    expect(S.customEx).toHaveLength(2)
    const created = S.customEx[1]
    expect(created.n).toBe('Nordic curl')
    expect(created.tg).toBe('hamstring')
    expect(created.sm).toEqual(['gluteal'])
    expect(created.desc).toBe('slow eccentric')
    // record-shape policy lives here, stated once: fresh 'c'-prefixed id, derived body part, custom marks
    expect(created.id).toMatch(/^c./)
    expect(created.bp).toBe('upper legs')
    expect(created.eq).toBe('custom')
    expect(created.custom).toBe(true)
    expect(res).toBe(created.id)
  })

  it('mints a fresh id per create, never reusing one', () => {
    const S = { customEx: [] }
    const a = upsertCustomEx(S, { id: null, n: 'One', tg: 'chest', sm: [], desc: '' })
    const b = upsertCustomEx(S, { id: null, n: 'Two', tg: 'chest', sm: [], desc: '' })
    expect(a).not.toBe(b)
    expect(S.customEx.map(x => x.id)).toEqual([a, b])
  })

  it('creates when there is no customEx list yet — a hand-made state cannot break the save', () => {
    const S = {}
    const res = upsertCustomEx(S, { id: null, n: 'First ever', tg: 'cardio', sm: [], desc: '' })

    expect(Array.isArray(S.customEx)).toBe(true)
    expect(S.customEx[0].bp).toBe('cardio')
    expect(res).toBe(S.customEx[0].id)
  })
})
