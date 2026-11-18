import { describe, it, expect, beforeEach } from 'vitest'
import { actRoutine, routineView } from './routines.js'
import { DEFAULT_GLYPH } from './glyphs.js'
import { t } from './i18n.js'
import { defaultConfig } from './workout-model.js'

describe('Routine Domain Module (lib/routines.js)', () => {
  let S

  beforeEach(() => {
    S = {
      routines: [
        {
          id: 'r-push',
          name: 'Push Day',
          emoji: '💪',
          prog: 'double',
          ex: [
            { id: '0025', sets: 3, reps: 8, weight: 60, mode: 'reps', notes: 'Bench cue' },
            { id: '0026', sets: 3, reps: 10, weight: 50, mode: 'reps' },
            { id: '0027', sets: 3, reps: 12, weight: 15, mode: 'reps' },
          ],
        },
      ],
      week: { 1: 'r-push', 3: 'r-push' },
      dayPlan: { '2026-11-20': 'r-push' },
    }
  })

  describe('actRoutine: create', () => {
    it('creates a routine with unique ID, default localized name, default emoji, empty ex array and appends to S.routines', () => {
      const res = actRoutine(S, { type: 'create' })
      expect(res.ok).toBe(true)
      expect(res.result).toBeDefined()
      expect(res.result.id).toMatch(/^[a-z0-9_-]+$/i)
      expect(res.result.name).toBe(t('New routine'))
      expect(res.result.emoji).toBe(DEFAULT_GLYPH)
      expect(res.result.ex).toEqual([])
      expect(S.routines).toHaveLength(2)
      expect(S.routines[1]).toBe(res.result)
    })

    it('respects custom name and emoji if provided', () => {
      const res = actRoutine(S, { type: 'create', name: 'Leg Day', emoji: '🦵' })
      expect(res.ok).toBe(true)
      expect(res.result.name).toBe('Leg Day')
      expect(res.result.emoji).toBe('🦵')
      expect(S.routines[1].name).toBe('Leg Day')
    })
  })

  describe('actRoutine: delete', () => {
    it('removes the routine from S.routines and calls detachRoutine to clean week and dayPlan', () => {
      const res = actRoutine(S, { type: 'delete', routineId: 'r-push' })
      expect(res.ok).toBe(true)
      expect(S.routines).toHaveLength(0)
      expect(S.week[1]).toBeUndefined()
      expect(S.week[3]).toBeUndefined()
      expect(S.dayPlan['2026-11-20']).toBeUndefined()
    })

    it('refuses unknown routineId with { ok: false }', () => {
      const res = actRoutine(S, { type: 'delete', routineId: 'r-nonexistent' })
      expect(res.ok).toBe(false)
      expect(S.routines).toHaveLength(1)
      expect(S.week[1]).toBe('r-push')
    })
  })

  describe('actRoutine: rename', () => {
    it('updates routine name', () => {
      const res = actRoutine(S, { type: 'rename', routineId: 'r-push', name: 'Upper Body Power' })
      expect(res.ok).toBe(true)
      expect(S.routines[0].name).toBe('Upper Body Power')
    })

    it('returns { ok: false } for unknown routineId', () => {
      const res = actRoutine(S, { type: 'rename', routineId: 'r-unknown', name: 'Test' })
      expect(res.ok).toBe(false)
    })
  })

  describe('actRoutine: setGlyph', () => {
    it('updates routine emoji', () => {
      const res = actRoutine(S, { type: 'setGlyph', routineId: 'r-push', emoji: '🔥' })
      expect(res.ok).toBe(true)
      expect(S.routines[0].emoji).toBe('🔥')
    })

    it('returns { ok: false } for unknown routineId', () => {
      const res = actRoutine(S, { type: 'setGlyph', routineId: 'r-unknown', emoji: '🔥' })
      expect(res.ok).toBe(false)
    })
  })

  describe('actRoutine: setProgression', () => {
    it('updates routine prog', () => {
      const res = actRoutine(S, { type: 'setProgression', routineId: 'r-push', prog: 'linear' })
      expect(res.ok).toBe(true)
      expect(S.routines[0].prog).toBe('linear')
    })

    it('returns { ok: false } for unknown routineId', () => {
      const res = actRoutine(S, { type: 'setProgression', routineId: 'r-unknown', prog: 'linear' })
      expect(res.ok).toBe(false)
    })
  })

  describe('actRoutine: addExercise', () => {
    it('initializes target using defaultConfig(exId) if target is not provided and appends to routine.ex', () => {
      const res = actRoutine(S, { type: 'addExercise', routineId: 'r-push', exId: '0001' })
      expect(res.ok).toBe(true)
      const expected = { id: '0001', ...defaultConfig('0001') }
      expect(S.routines[0].ex).toHaveLength(4)
      expect(S.routines[0].ex[3]).toEqual(expected)
      expect(res.result).toEqual(expected)
    })

    it('merges provided target over defaultConfig', () => {
      const res = actRoutine(S, {
        type: 'addExercise',
        routineId: 'r-push',
        exId: '0001',
        target: { sets: 5, reps: 5, weight: 100 },
      })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[3]).toEqual({
        id: '0001',
        ...defaultConfig('0001'),
        sets: 5,
        reps: 5,
        weight: 100,
      })
    })

    it('returns { ok: false } for unknown routineId or missing exId', () => {
      expect(actRoutine(S, { type: 'addExercise', routineId: 'r-unknown', exId: '0001' }).ok).toBe(false)
      expect(actRoutine(S, { type: 'addExercise', routineId: 'r-push', exId: null }).ok).toBe(false)
    })
  })

  describe('actRoutine: removeExercise', () => {
    it('splices entry and calls cleanupSg on routine.ex', () => {
      // First, set up a superset between 0 and 1
      S.routines[0].ex[0].sg = 'sg-0-1'
      S.routines[0].ex[1].sg = 'sg-0-1'

      // Removing entry 0 should leave entry 1 isolated; cleanupSg should clear entry 1's sg
      const res = actRoutine(S, { type: 'removeExercise', routineId: 'r-push', index: 0 })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex).toHaveLength(2)
      expect(S.routines[0].ex[0].id).toBe('0026')
      expect(S.routines[0].ex[0].sg).toBeUndefined()
    })

    it('returns { ok: false } for out of bounds index', () => {
      expect(actRoutine(S, { type: 'removeExercise', routineId: 'r-push', index: -1 }).ok).toBe(false)
      expect(actRoutine(S, { type: 'removeExercise', routineId: 'r-push', index: 10 }).ok).toBe(false)
    })
  })

  describe('actRoutine: moveExercise', () => {
    it('checks bounds, swaps entries, and calls cleanupSg(routine.ex)', () => {
      // Setup superset between 0 and 1
      S.routines[0].ex[0].sg = 'sg-0-1'
      S.routines[0].ex[1].sg = 'sg-0-1'

      // Move 0 down by +1: swaps 0 and 1 (still adjacent, sg preserved)
      const res1 = actRoutine(S, { type: 'moveExercise', routineId: 'r-push', index: 0, dir: 1 })
      expect(res1.ok).toBe(true)
      expect(S.routines[0].ex[0].id).toBe('0026')
      expect(S.routines[0].ex[1].id).toBe('0025')
      expect(S.routines[0].ex[0].sg).toBe('sg-0-1')
      expect(S.routines[0].ex[1].sg).toBe('sg-0-1')

      // Now move 0 down to 2 (move index 0 dir 1 swaps 0 and 1 again).
      // Now move entry 2 (0027) up by -1 to index 1: separates 0026 (at 0) and 0025 (now at 2)
      const res2 = actRoutine(S, { type: 'moveExercise', routineId: 'r-push', index: 2, dir: -1 })
      expect(res2.ok).toBe(true)
      expect(S.routines[0].ex.map(e => e.id)).toEqual(['0026', '0027', '0025'])
      // Because 0026 and 0025 are no longer adjacent, cleanupSg clears both sg!
      expect(S.routines[0].ex[0].sg).toBeUndefined()
      expect(S.routines[0].ex[2].sg).toBeUndefined()
    })

    it('refuses move out of bounds with { ok: false }', () => {
      expect(actRoutine(S, { type: 'moveExercise', routineId: 'r-push', index: 0, dir: -1 }).ok).toBe(false)
      expect(actRoutine(S, { type: 'moveExercise', routineId: 'r-push', index: 2, dir: 1 }).ok).toBe(false)
      expect(actRoutine(S, { type: 'moveExercise', routineId: 'r-push', index: 5, dir: 1 }).ok).toBe(false)
    })
  })

  describe('actRoutine: replaceExercise', () => {
    it('swaps entry in place, clears notes per ADR 0015, seeds defaults, and normalizes superset via cleanupSg', () => {
      // Entry 0 has notes: 'Bench cue'
      expect(S.routines[0].ex[0].notes).toBe('Bench cue')
      S.routines[0].ex[0].sg = 'sg-0-1'
      S.routines[0].ex[1].sg = 'sg-0-1'

      const res = actRoutine(S, {
        type: 'replaceExercise',
        routineId: 'r-push',
        index: 0,
        exId: '0004',
        target: { sets: 4, reps: 6, weight: 80 },
      })

      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0].id).toBe('0004')
      expect(S.routines[0].ex[0].sets).toBe(4)
      expect(S.routines[0].ex[0].reps).toBe(6)
      expect(S.routines[0].ex[0].weight).toBe(80)
      // Notes cleared!
      expect(S.routines[0].ex[0].notes).toBeUndefined()
      // Preserved superset linkage with entry 1
      expect(S.routines[0].ex[0].sg).toBe('sg-0-1')
      expect(S.routines[0].ex[1].sg).toBe('sg-0-1')
    })

    it('returns { ok: false } for invalid index or unknown routine', () => {
      expect(actRoutine(S, { type: 'replaceExercise', routineId: 'r-push', index: -1, exId: '0004' }).ok).toBe(false)
      expect(actRoutine(S, { type: 'replaceExercise', routineId: 'r-push', index: 10, exId: '0004' }).ok).toBe(false)
      expect(actRoutine(S, { type: 'replaceExercise', routineId: 'r-unknown', index: 0, exId: '0004' }).ok).toBe(false)
    })
  })

  describe('actRoutine: toggleSuperset', () => {
    it('pairs adjacent exercises when unpaired, and unpairs when already paired, calling cleanupSg', () => {
      // Initially unpaired
      expect(S.routines[0].ex[0].sg).toBeUndefined()
      expect(S.routines[0].ex[1].sg).toBeUndefined()

      // Pair 0 with subsequent (1)
      const resPair = actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 0 })
      expect(resPair.ok).toBe(true)
      expect(S.routines[0].ex[0].sg).toBeDefined()
      expect(S.routines[0].ex[1].sg).toBe(S.routines[0].ex[0].sg)

      // Toggle again on 0 unpairs them
      const resUnpair = actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 0 })
      expect(resUnpair.ok).toBe(true)
      expect(S.routines[0].ex[0].sg).toBeUndefined()
      expect(S.routines[0].ex[1].sg).toBeUndefined()
    })

    it('supports linking with previous via withAbove flag', () => {
      const res = actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 1, withAbove: true })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0].sg).toBeDefined()
      expect(S.routines[0].ex[1].sg).toBe(S.routines[0].ex[0].sg)
    })

    it('returns { ok: false } when out of bounds', () => {
      expect(actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 2 }).ok).toBe(false)
      expect(actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: -1 }).ok).toBe(false)
      expect(actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 0, withAbove: true }).ok).toBe(false)
    })
  })

  describe('actRoutine: syncFromSession', () => {
    it('deep clones syncedEx onto routine.ex', () => {
      const syncedEx = [
        { id: '0025', sets: 4, reps: 8, weight: 60, mode: 'reps' },
        { id: '0028', sets: 3, reps: 10, weight: 30, mode: 'reps', notes: 'New cue' },
      ]

      const res = actRoutine(S, { type: 'syncFromSession', routineId: 'r-push', syncedEx })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex).toEqual(syncedEx)
      // Verify deep clone (independent object references)
      expect(S.routines[0].ex).not.toBe(syncedEx)
      expect(S.routines[0].ex[0]).not.toBe(syncedEx[0])
    })

    it('returns { ok: false } for unknown routine or non-array syncedEx', () => {
      expect(actRoutine(S, { type: 'syncFromSession', routineId: 'r-unknown', syncedEx: [] }).ok).toBe(false)
      expect(actRoutine(S, { type: 'syncFromSession', routineId: 'r-push', syncedEx: null }).ok).toBe(false)
    })
  })

  describe('actRoutine: updateExercise', () => {
    it('updates configuration of an existing exercise in place', () => {
      const res = actRoutine(S, {
        type: 'updateExercise',
        routineId: 'r-push',
        index: 0,
        target: { sets: 5, weight: 70 },
      })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0].sets).toBe(5)
      expect(S.routines[0].ex[0].weight).toBe(70)
      expect(S.routines[0].ex[0].id).toBe('0025')
    })
  })

  describe('actRoutine error handling', () => {
    it('throws only on unknown command type', () => {
      expect(() => actRoutine(S, { type: 'unrecognized_cmd' })).toThrow(/Unknown Routine command/)
    })

    it('gracefully returns { ok: false } for null state or missing routines', () => {
      expect(actRoutine(null, { type: 'delete', routineId: 'r-push' }).ok).toBe(false)
      expect(actRoutine({}, { type: 'delete', routineId: 'r-push' }).ok).toBe(false)
      expect(actRoutine({ routines: null }, { type: 'delete', routineId: 'r-push' }).ok).toBe(false)
    })
  })

  describe('routineView(routine)', () => {
    it('derives steps via supersetUnits, isLinkedPrev, isLinkedNext, inSuperset, isFirstInSuperset, and hasNote', () => {
      const routine = {
        id: 'r1',
        name: 'Upper',
        ex: [
          { id: '0001', sg: 'sg-1', notes: 'First exercise note' },
          { id: '0002', sg: 'sg-1', notes: '   ' }, // empty note
          { id: '0003' }, // standalone exercise, no note
        ],
      }

      const view = routineView(routine)
      expect(view.steps).toHaveLength(2)
      expect(view.steps[0]).toEqual({ entries: [0, 1], isSuperset: true, isLast: false })
      expect(view.steps[1]).toEqual({ entries: [2], isSuperset: false, isLast: true })

      expect(view.entries).toHaveLength(3)

      // Entry 0: first in superset, linked next, hasNote: true
      expect(view.entries[0].index).toBe(0)
      expect(view.entries[0].id).toBe('0001')
      expect(view.entries[0].isLinkedPrev).toBe(false)
      expect(view.entries[0].isLinkedNext).toBe(true)
      expect(view.entries[0].inSuperset).toBe(true)
      expect(view.entries[0].isFirstInSuperset).toBe(true)
      expect(view.entries[0].hasNote).toBe(true)

      // Entry 1: second in superset, linked prev, empty note -> hasNote: false
      expect(view.entries[1].index).toBe(1)
      expect(view.entries[1].id).toBe('0002')
      expect(view.entries[1].isLinkedPrev).toBe(true)
      expect(view.entries[1].isLinkedNext).toBe(false)
      expect(view.entries[1].inSuperset).toBe(true)
      expect(view.entries[1].isFirstInSuperset).toBe(false)
      expect(view.entries[1].hasNote).toBe(false)

      // Entry 2: standalone, no superset, no note
      expect(view.entries[2].index).toBe(2)
      expect(view.entries[2].id).toBe('0003')
      expect(view.entries[2].isLinkedPrev).toBe(false)
      expect(view.entries[2].isLinkedNext).toBe(false)
      expect(view.entries[2].inSuperset).toBe(false)
      expect(view.entries[2].isFirstInSuperset).toBe(false)
      expect(view.entries[2].hasNote).toBe(false)
    })

    it('handles nullish routine gracefully', () => {
      const view = routineView(null)
      expect(view).toEqual({ steps: [], entries: [] })
    })
  })
})
