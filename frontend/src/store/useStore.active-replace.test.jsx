// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore, DEF } from './useStore.js'

describe('useStore.replaceActiveExercise', () => {
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
    const entry = useStore.getState().replaceActiveExercise(0, '0025', { sets: 3, reps: 8, weight: 50 })
    expect(entry).toBeDefined()
    expect(entry.id).toBe('0025')
    const S = useStore.getState().S
    expect(S.active.entries[0].id).toBe('0025')
    expect(S.active.entries[0]).toBe(entry)
    expect(S.active.cur).toBe(0)
  })
})
