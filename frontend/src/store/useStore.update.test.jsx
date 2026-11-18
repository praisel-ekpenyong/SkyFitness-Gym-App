// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

const { useStore } = await import('./useStore.js')
const { DEF } = await import('../lib/profile/index.js')
const { save } = await import('../platform/storage.js')

const done = { id: 'w0', d: '2026-11-01', name: 'Push', entries: [{ id: 'a', sets: [{ w: 50, r: 8, done: true }] }] }

describe('update copies only what changed', () => {
  it('ticking a Set keeps S.workouts the same array', () => {
    useStore.setState({
      S: {
        ...DEF,
        workouts: [done],
        active: { id: 'a1', d: '2026-11-16', start: 1, name: 'Push', cur: 0, entries: [{ id: 'a', target: { reps: 8, weight: 50 }, sets: [{ w: 50, r: 8, done: false }, { w: 50, r: 8, done: false }] }] },
      },
    })
    const before = useStore.getState().S
    useStore.getState().act({ type: 'toggle', entry: 0, set: 0 })
    const after = useStore.getState().S
    expect(after).not.toBe(before)
    expect(after.active.entries[0].sets[0].done).toBe(true)
    expect(after.workouts).toBe(before.workouts)
  })

  it('stamps _ts on the new Profile and leaves the old one alone', () => {
    useStore.setState({ S: { ...DEF, _ts: 1 } })
    const before = useStore.getState().S
    useStore.getState().update(s => { s.restSec = 120 })
    expect(before._ts).toBe(1)
    expect(before.restSec).toBe(90)
    expect(useStore.getState().S._ts).toBeGreaterThan(1)
  })

  it('the state it commits is frozen in tests', () => {
    useStore.setState({ S: { ...DEF } })
    useStore.getState().update(s => { s.restSec = 120 })
    expect(Object.isFrozen(useStore.getState().S)).toBe(true)
  })
})

describe('save', () => {
  it('reads its argument and never writes to it', () => {
    const snap = Object.freeze({ ...DEF, _ts: 5 })
    expect(() => save(snap)).not.toThrow()
    expect(snap._ts).toBe(5)
  })
})

describe('act results outlive the update', () => {
  it('finishing a Routine session with changes hands back a routineSync the finish sheet can read', () => {
    useStore.setState({
      S: {
        ...DEF,
        routines: [{ id: 'r1', name: 'Push', ex: [{ id: 'a', sets: 3, reps: 8, weight: 50 }] }],
        active: { id: 'a1', d: '2026-11-16', start: 1, name: 'Push', routineId: 'r1', cur: 0, entries: [
          { id: 'a', target: { sets: 3, reps: 8, weight: 50 }, sets: [{ w: 50, r: 8, done: true }] },
          { id: 'b', target: { sets: 3, reps: 10, weight: 20 }, sets: [{ w: 20, r: 10, done: true }] },
        ] },
      },
    })
    const res = useStore.getState().act({ type: 'finish' })
    const sync = res.result.routineSync
    expect(sync.hasDiff).toBe(true)
    expect(JSON.parse(JSON.stringify(sync)).syncedEx.map(e => e.id)).toEqual(['a', 'b'])
    expect(res.result.workout.entries.map(e => e.sets.length)).toEqual([1, 1])
    expect(useStore.getState().syncRoutineFromSession(sync.routineId, sync.syncedEx)).toBe(true)
  })
})
