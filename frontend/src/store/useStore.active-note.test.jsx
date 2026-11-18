// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './useStore.js'
import { DEF } from '../lib/profile/index.js'

describe('useStore.act note', () => {
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
    useStore.getState().S.active.entries[0].target.notes = 'Baseline routine cue'
    const res = useStore.getState().act({ type: 'note', entry: 0, text: '  Seat height 5, pin 8  ' })
    expect(res.ok).toBe(true)
    const S = useStore.getState().S
    expect(S.active.entries[0].notes).toBe('Seat height 5, pin 8')
    expect(S.active.entries[0].target.notes).toBe('Baseline routine cue')
  })

  it('clamps note text to 500 characters', () => {
    const longNote = 'a'.repeat(600)
    useStore.getState().act({ type: 'note', entry: 0, text: longNote })
    const S = useStore.getState().S
    expect(S.active.entries[0].notes.length).toBe(500)
    expect(S.active.entries[0].notes).toBe('a'.repeat(500))
  })

  it('removes notes when passed an empty string or whitespace only without mutating target', () => {
    useStore.getState().S.active.entries[0].target.notes = 'Baseline routine cue'
    useStore.getState().act({ type: 'note', entry: 0, text: 'Existing note' })
    expect(useStore.getState().S.active.entries[0].notes).toBe('Existing note')

    const res = useStore.getState().act({ type: 'note', entry: 0, text: '   ' })
    expect(res.ok).toBe(true)
    const S = useStore.getState().S
    expect(S.active.entries[0].notes).toBeUndefined()
    expect(S.active.entries[0].target.notes).toBe('Baseline routine cue')
    expect('notes' in S.active.entries[0]).toBe(false)
  })

  it('safely ignores non-existent entry index or missing active session', () => {
    expect(useStore.getState().act({ type: 'note', entry: 99, text: 'note' }).ok).toBe(false)
    useStore.setState({ S: { ...DEF, active: null } })
    expect(useStore.getState().act({ type: 'note', entry: 0, text: 'note' }).ok).toBe(false)
  })
})
