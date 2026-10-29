import { describe, it, expect } from 'vitest'
import { diffRoutineWithSession, syncRoutineFromSession } from './routine-sync.js'

describe('diffRoutineWithSession', () => {
  const ex1 = { id: '0025', name: 'Barbell Bench Press', sets: 3, reps: 8, weight: 60, mode: 'reps' }
  const ex2 = { id: '0026', name: 'Barbell Incline Bench Press', sets: 3, reps: 10, weight: 50, mode: 'reps' }
  const ex3 = { id: '0027', name: 'Cable Flyes', sets: 3, reps: 12, weight: 15, mode: 'reps' }

  const makeEntry = (cfg, doneSetsCount, opts = {}) => {
    const { warmups = 0, targetOverrides = {}, setsOverrides = null, sg = undefined } = opts
    const target = { ...cfg, ...targetOverrides }
    let sets = []
    if (setsOverrides) {
      sets = setsOverrides
    } else {
      for (let i = 0; i < warmups; i++) {
        sets.push({ w: (target.weight || 20) * 0.5, r: target.reps || 10, done: true, phase: 'warmup', warmup: true })
      }
      for (let i = 0; i < doneSetsCount; i++) {
        sets.push({ w: target.weight || 50, r: target.reps || 8, done: true, phase: 'work' })
      }
      const remaining = Math.max(0, (target.sets || 3) - doneSetsCount)
      for (let i = 0; i < remaining; i++) {
        sets.push({ w: target.weight || 50, r: target.reps || 8, done: false, phase: 'work' })
      }
    }
    const entry = { id: cfg.id, target, sets }
    if (sg !== undefined) entry.sg = sg
    if ('notes' in opts) {
      if (opts.notes !== undefined) entry.notes = opts.notes
    } else if (cfg.notes !== undefined) {
      entry.notes = cfg.notes
    }
    return entry
  }

  describe('guards and edge cases', () => {
    it('returns hasDiff: false and empty syncedEx when routine is null or missing', () => {
      const session = { id: 's1', routineId: 'r1', entries: [makeEntry(ex1, 3)] }
      const res = diffRoutineWithSession(null, session)
      expect(res).toEqual({
        hasDiff: false,
        changes: [],
        syncedEx: [],
      })
    })

    it('returns hasDiff: false and routine.ex when activeSession is null', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }] }
      const res = diffRoutineWithSession(routine, null)
      expect(res).toEqual({
        hasDiff: false,
        changes: [],
        syncedEx: [{ ...ex1 }],
      })
    })

    it('returns hasDiff: false when activeSession is a freestyle session (no routineId)', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }] }
      const freeSession = { id: 's1', routineId: null, entries: [makeEntry(ex1, 4)] }
      const res = diffRoutineWithSession(routine, freeSession)
      expect(res.hasDiff).toBe(false)
      expect(res.changes).toEqual([])
      expect(res.syncedEx).toEqual([{ ...ex1 }])
    })

    it('returns hasDiff: false when both routine.ex and session entries are empty', () => {
      const routine = { id: 'r1', name: 'Empty', ex: [] }
      const session = { id: 's1', routineId: 'r1', entries: [] }
      const res = diffRoutineWithSession(routine, session)
      expect(res).toEqual({
        hasDiff: false,
        changes: [],
        syncedEx: [],
      })
    })
  })

  describe('identical workouts', () => {
    it('returns hasDiff: false when exercises, order, supersets, and work set counts match exactly', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }, { ...ex2 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3), makeEntry(ex2, 3)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(false)
      expect(res.changes).toEqual([])
      expect(res.syncedEx).toHaveLength(2)
      expect(res.syncedEx[0].sets).toBe(3)
      expect(res.syncedEx[1].sets).toBe(3)
    })
  })

  describe('added exercises', () => {
    it('detects added exercises and formats descriptor with +', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3), makeEntry(ex2, 3)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('+ Barbell Incline Bench Press')
      expect(res.syncedEx).toHaveLength(2)
      expect(res.syncedEx[1].id).toBe(ex2.id)
    })
  })

  describe('removed exercises', () => {
    it('detects removed exercises and formats descriptor with -', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }, { ...ex2 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('- Barbell Incline Bench Press')
      expect(res.syncedEx).toHaveLength(1)
      expect(res.syncedEx[0].id).toBe(ex1.id)
    })
  })

  describe('replaced exercises', () => {
    it('detects in-place exercise replacement and formats ⇄ descriptor', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }, { ...ex2 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3), makeEntry(ex3, 3)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('⇄ Replaced Barbell Incline Bench Press → Cable Flyes')
      expect(res.syncedEx).toHaveLength(2)
      expect(res.syncedEx[0].id).toBe(ex1.id)
      expect(res.syncedEx[1].id).toBe(ex3.id)
    })
  })

  describe('reordered exercises', () => {
    it('detects changed exercise sequence and formats ⇅ Reordered descriptor', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }, { ...ex2 }, { ...ex3 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex2, 3), makeEntry(ex1, 3), makeEntry(ex3, 3)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('⇅ Reordered')
      expect(res.syncedEx.map(e => e.id)).toEqual([ex2.id, ex1.id, ex3.id])
    })
  })

  describe('superset groupings', () => {
    it('detects newly paired supersets in session', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }, { ...ex2 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3, { sg: 'sg-1' }), makeEntry(ex2, 3, { sg: 'sg-1' })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes.some(c => c.includes('Superset:') && c.includes('Barbell Bench Press'))).toBe(true)
      expect(res.syncedEx[0].sg).toBe('sg-1')
      expect(res.syncedEx[1].sg).toBe('sg-1')
    })

    it('detects unpaired supersets in session', () => {
      const routine = {
        id: 'r1',
        name: 'Push',
        ex: [{ ...ex1, sg: 'sg-1' }, { ...ex2, sg: 'sg-1' }],
      }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3), makeEntry(ex2, 3)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes.some(c => c.toLowerCase().includes('unlinked') || c.toLowerCase().includes('unpaired'))).toBe(true)
      expect(res.syncedEx[0].sg).toBeUndefined()
      expect(res.syncedEx[1].sg).toBeUndefined()
    })

    it('preserves superset without false diff when an exercise within it was replaced', () => {
      const routine = {
        id: 'r1',
        name: 'Push',
        ex: [{ ...ex1, sg: 'sg-1' }, { ...ex2, sg: 'sg-1' }],
      }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3, { sg: 'sg-1' }), makeEntry(ex3, 3, { sg: 'sg-1' })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('⇄ Replaced Barbell Incline Bench Press → Cable Flyes')
      // Should not also generate unlinked/linked superset change
      expect(res.changes.filter(c => c.toLowerCase().includes('superset'))).toHaveLength(0)
      expect(res.syncedEx[0].sg).toBe('sg-1')
      expect(res.syncedEx[1].sg).toBe('sg-1')
    })
  })

  describe('work set counts & zero-set preservation', () => {
    it('detects increased work sets and updates target set count', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, sets: 3 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 4)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('Barbell Bench Press: 3 → 4 sets')
      expect(res.syncedEx[0].sets).toBe(4)
    })

    it('detects decreased work sets and updates target set count', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, sets: 3 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 2)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('Barbell Bench Press: 3 → 2 sets')
      expect(res.syncedEx[0].sets).toBe(2)
    })

    it('ignores warm-up sets when calculating performed work sets count', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, sets: 3 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3, { warmups: 2 })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(false)
      expect(res.changes).toEqual([])
      expect(res.syncedEx[0].sets).toBe(3)
    })

    it('preserves planned target sets for skipped exercises (zero work sets performed)', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, sets: 3 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 0)],
      }
      const res = diffRoutineWithSession(routine, session)
      // When zero sets were performed and no other change happened, routine target sets remain 3 -> no diff
      expect(res.hasDiff).toBe(false)
      expect(res.changes).toEqual([])
      expect(res.syncedEx).toHaveLength(1)
      expect(res.syncedEx[0].sets).toBe(3)
    })

    it('preserves target sets for skipped exercise alongside another exercise that changed', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, sets: 3 }, { ...ex2, sets: 3 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 4), makeEntry(ex2, 0)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toEqual(['Barbell Bench Press: 3 → 4 sets'])
      expect(res.syncedEx[0].sets).toBe(4)
      expect(res.syncedEx[1].sets).toBe(3)
    })

    it('preserves target sets when an added exercise has zero performed sets', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, sets: 3 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3), makeEntry(ex2, 0, { targetOverrides: { sets: 4 } })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('+ Barbell Incline Bench Press')
      expect(res.syncedEx[1].sets).toBe(4)
    })
  })

  describe('configuration parameters & load safety', () => {
    it('preserves exercise configuration (mode, reps, sec, min, speed, bodyweight, prog) and does not overwrite baseline weight with session loads', () => {
      const timedEx = { id: 'timed-1', name: 'Plank', sets: 3, mode: 'time', sec: 60, weight: 10, prog: 'double', inc: 5 }
      const routine = { id: 'r1', name: 'Core', ex: [{ ...timedEx }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [{
          id: timedEx.id,
          target: { ...timedEx },
          sets: [
            { sec: 75, w: 20, done: true, phase: 'work' },
            { sec: 80, w: 25, done: true, phase: 'work' },
            { sec: 80, w: 25, done: true, phase: 'work' },
          ],
        }],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.syncedEx[0].mode).toBe('time')
      expect(res.syncedEx[0].sec).toBe(60)
      expect(res.syncedEx[0].prog).toBe('double')
      expect(res.syncedEx[0].inc).toBe(5)
      // Must NOT overwrite baseline weight 10 with session load 25
      expect(res.syncedEx[0].weight).toBe(10)
    })
  })

  describe('exercise notes diffing & routine projection', () => {
    it('detects added note and generates "{name}: note updated" descriptor', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3, { notes: 'Seat height 5, pin 8' })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('Barbell Bench Press: note updated')
      expect(res.syncedEx[0].notes).toBe('Seat height 5, pin 8')
    })

    it('detects modified note and generates "{name}: note updated" descriptor', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, notes: 'Seat height 4' }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3, { notes: 'Seat height 5' })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('Barbell Bench Press: note updated')
      expect(res.syncedEx[0].notes).toBe('Seat height 5')
    })

    it('detects cleared note and generates "{name}: note removed" descriptor', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, notes: 'Seat height 5' }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3, { notes: undefined })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('Barbell Bench Press: note removed')
      expect(res.syncedEx[0].notes).toBeUndefined()
    })

    it('treats whitespace-only note as cleared and removes note', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, notes: 'Seat height 5' }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3, { notes: '    ' })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('Barbell Bench Press: note removed')
      expect(res.syncedEx[0].notes).toBeUndefined()
    })

    it('produces no diff when notes match identically (including trimming)', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1, notes: 'Seat height 5' }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3, { notes: '  Seat height 5  ' })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(false)
      expect(res.changes).toEqual([])
      expect(res.syncedEx[0].notes).toBe('Seat height 5')
    })

    it('produces no diff when neither routine nor session has a note', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3)],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(false)
      expect(res.changes).toEqual([])
      expect(res.syncedEx[0].notes).toBeUndefined()
    })

    it('preserves note on newly added exercise in syncedEx without duplicate note tag', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }] }
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [
          makeEntry(ex1, 3),
          makeEntry(ex2, 3, { notes: 'Incline bench at 30°' }),
        ],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.changes).toContain('+ Barbell Incline Bench Press')
      // Should NOT have a separate "note updated" change for the newly added exercise
      expect(res.changes.filter(c => c.includes('note'))).toHaveLength(0)
      expect(res.syncedEx).toHaveLength(2)
      expect(res.syncedEx[1].notes).toBe('Incline bench at 30°')
    })

    it('trims note and clamps to 500 characters on syncedEx', () => {
      const routine = { id: 'r1', name: 'Push', ex: [{ ...ex1 }] }
      const longNote = 'A'.repeat(600)
      const session = {
        id: 's1',
        routineId: 'r1',
        entries: [makeEntry(ex1, 3, { notes: `  ${longNote}  ` })],
      }
      const res = diffRoutineWithSession(routine, session)
      expect(res.hasDiff).toBe(true)
      expect(res.syncedEx[0].notes).toHaveLength(500)
      expect(res.syncedEx[0].notes).toBe('A'.repeat(500))
    })
  })
})

describe('syncRoutineFromSession', () => {
  it('updates the matching routine ex array in state and returns true', () => {
    const S = {
      routines: [
        { id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3 }] },
        { id: 'r2', name: 'Pull', ex: [{ id: '0027', sets: 3 }] },
      ],
    }
    const syncedEx = [{ id: '0025', sets: 4 }, { id: '0026', sets: 3 }]
    const ok = syncRoutineFromSession(S, 'r1', syncedEx)
    expect(ok).toBe(true)
    expect(S.routines[0].ex).toEqual(syncedEx)
    expect(S.routines[1].ex).toEqual([{ id: '0027', sets: 3 }])
  })

  it('safely returns false and no-ops if routine is not found', () => {
    const S = {
      routines: [{ id: 'r1', name: 'Push', ex: [{ id: '0025', sets: 3 }] }],
    }
    const ok = syncRoutineFromSession(S, 'non-existent', [{ id: '0025', sets: 4 }])
    expect(ok).toBe(false)
    expect(S.routines[0].ex).toEqual([{ id: '0025', sets: 3 }])
  })

  it('safely returns false when S or S.routines is missing', () => {
    expect(syncRoutineFromSession(null, 'r1', [])).toBe(false)
    expect(syncRoutineFromSession({}, 'r1', [])).toBe(false)
    expect(syncRoutineFromSession({ routines: null }, 'r1', [])).toBe(false)
  })
})
