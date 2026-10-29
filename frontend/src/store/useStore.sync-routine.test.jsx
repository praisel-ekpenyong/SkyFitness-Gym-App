// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore, DEF } from './useStore.js'

describe('useStore.syncRoutineFromSession', () => {
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
    const ok = useStore.getState().syncRoutineFromSession('r1', updatedEx)
    expect(ok).toBe(true)

    const routine = useStore.getState().S.routines.find(r => r.id === 'r1')
    expect(routine.ex).toEqual(updatedEx)

    // Other routines remain untouched
    const routine2 = useStore.getState().S.routines.find(r => r.id === 'r2')
    expect(routine2.ex).toEqual([{ id: '0027', sets: 3 }])
  })

  it('safely returns false and leaves routines untouched when routine is not found', () => {
    const ok = useStore.getState().syncRoutineFromSession('r-unknown', [{ id: '0025', sets: 5 }])
    expect(ok).toBe(false)

    expect(useStore.getState().S.routines[0].ex).toEqual([{ id: '0025', sets: 3 }])
  })
})
