// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore, DEF } from './useStore.js'

describe('useStore.act replaceExercise', () => {
  beforeEach(() => {
    useStore.setState({
      S: {
        ...DEF,
        active: {
          id: 'test-session',
          routineId: null,
          cur: 0,
          entries: [
            { id: '0001', sets: [{ w: 20, r: 10, done: true }] },
            { id: '0002', sets: [{ w: 30, r: 8, done: false }] },
          ],
        },
      },
    })
  })

  it('delegates to replaceActiveExercise, mutates S.active in-place, and returns the new entry', () => {
    const res = useStore.getState().act({ type: 'replaceExercise', entry: 0, exId: '0025', target: { sets: 3, reps: 8, weight: 50 } })
    expect(res.ok).toBe(true)
    const S = useStore.getState().S
    expect(S.active.entries[0].id).toBe('0025')
    expect(S.active.entries[1].id).toBe('0002')
    expect(S.active.cur).toBe(0)
  })
})
