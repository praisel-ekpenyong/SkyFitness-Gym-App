// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore.js'
import { DEF } from '../lib/profile/index.js'

describe('useStore.actRoutine syncFromSession', () => {
  beforeEach(() => {
    useStore.setState({
      S: {
        ...DEF,
        routines: [
          { id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3 }] },
          { id: 'r2', name: 'Pull', ex: [{ id: '0027', sets: 3 }] },
        ],
      },
    })
  })

  it('mutates target routine ex array in store state and returns true', () => {
    const updatedEx = [{ id: '0025', sets: 4 }, { id: '0026', sets: 3 }]
    const res = useStore.getState().actRoutine({ type: 'syncFromSession', routineId: 'r1', syncedEx: updatedEx })
    expect(res.ok).toBe(true)

    const routine = useStore.getState().S.routines.find(r => r.id === 'r1')
    expect(routine.ex.map(({ rowId, ...rest }) => rest)).toEqual(updatedEx)
    expect(routine.ex.every(e => typeof e.rowId === 'string' && e.rowId)).toBe(true)

    const routine2 = useStore.getState().S.routines.find(r => r.id === 'r2')
    expect(routine2.ex).toEqual([{ id: '0027', sets: 3 }])
  })

  it('safely returns false and leaves routines untouched when routine is not found', () => {
    const res = useStore.getState().actRoutine({ type: 'syncFromSession', routineId: 'r-unknown', syncedEx: [{ id: '0025', sets: 5 }] })
    expect(res.ok).toBe(false)

    expect(useStore.getState().S.routines[0].ex).toEqual([{ id: '0025', sets: 3 }])
  })
})
