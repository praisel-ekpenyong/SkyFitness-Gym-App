// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore, DEF } from './useStore.js'

describe('useStore.updateActiveExerciseNote', () => {
  beforeEach(() => {
    useStore.setState({
      S: {
        ...DEF,
        active: {
          id: 'test-session',
          routineId: 'r1',
          cur: 0,
          entries: [
            {
              id: '0025',
              target: { sets: 3, reps: 5 },
              sets: [{ w: 60, r: 5, done: false }],
            },
          ],
        },
      },
    })
  })

  it('updates entry.notes and entry.target.notes with trimmed note text', () => {
    useStore.getState().updateActiveExerciseNote(0, '  Seat height 5, pin 8  ')
    const S = useStore.getState().S
    expect(S.active.entries[0].notes).toBe('Seat height 5, pin 8')
    expect(S.active.entries[0].target.notes).toBe('Seat height 5, pin 8')
  })

  it('clamps note text to 500 characters', () => {
    const longNote = 'a'.repeat(600)
    useStore.getState().updateActiveExerciseNote(0, longNote)
    const S = useStore.getState().S
    expect(S.active.entries[0].notes.length).toBe(500)
    expect(S.active.entries[0].notes).toBe('a'.repeat(500))
  })

  it('removes notes when passed an empty string or whitespace only', () => {
    useStore.getState().updateActiveExerciseNote(0, 'Existing note')
    expect(useStore.getState().S.active.entries[0].notes).toBe('Existing note')

    useStore.getState().updateActiveExerciseNote(0, '   ')
    const S = useStore.getState().S
    expect(S.active.entries[0].notes).toBeUndefined()
    expect(S.active.entries[0].target.notes).toBeUndefined()
    expect('notes' in S.active.entries[0]).toBe(false)
  })

  it('safely ignores non-existent entry index or missing active session', () => {
    expect(() => useStore.getState().updateActiveExerciseNote(99, 'note')).not.toThrow()
    useStore.setState({ S: { ...DEF, active: null } })
    expect(() => useStore.getState().updateActiveExerciseNote(0, 'note')).not.toThrow()
  })
})
