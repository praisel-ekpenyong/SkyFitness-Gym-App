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

  it('updates entry.notes with trimmed note text without mutating entry.target.notes', () => {
    // Set a frozen routine baseline note on target
    useStore.getState().S.active.entries[0].target.notes = 'Baseline routine cue'
    const res = useStore.getState().updateActiveExerciseNote(0, '  Seat height 5, pin 8  ')
    expect(res).toBe(true)
    const S = useStore.getState().S
    expect(S.active.entries[0].notes).toBe('Seat height 5, pin 8')
    expect(S.active.entries[0].target.notes).toBe('Baseline routine cue')
  })

  it('clamps note text to 500 characters', () => {
    const longNote = 'a'.repeat(600)
    useStore.getState().updateActiveExerciseNote(0, longNote)
    const S = useStore.getState().S
    expect(S.active.entries[0].notes.length).toBe(500)
    expect(S.active.entries[0].notes).toBe('a'.repeat(500))
  })

  it('removes notes when passed an empty string or whitespace only without mutating target', () => {
    useStore.getState().S.active.entries[0].target.notes = 'Baseline routine cue'
    useStore.getState().updateActiveExerciseNote(0, 'Existing note')
    expect(useStore.getState().S.active.entries[0].notes).toBe('Existing note')

    const res = useStore.getState().updateActiveExerciseNote(0, '   ')
    expect(res).toBe(true)
    const S = useStore.getState().S
    expect(S.active.entries[0].notes).toBeUndefined()
    expect(S.active.entries[0].target.notes).toBe('Baseline routine cue')
    expect('notes' in S.active.entries[0]).toBe(false)
  })

  it('safely ignores non-existent entry index or missing active session', () => {
    expect(useStore.getState().updateActiveExerciseNote(99, 'note')).toBe(false)
    useStore.setState({ S: { ...DEF, active: null } })
    expect(useStore.getState().updateActiveExerciseNote(0, 'note')).toBe(false)
  })
})
