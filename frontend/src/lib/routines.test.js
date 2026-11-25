import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { actRoutine, routineView } from './routines.js'
import { registerCustom } from './exercises.js'
import { act } from './active-workout.js'
import { DEFAULT_GLYPH } from './glyphs.js'
import { t } from './i18n.js'
import { defaultConfig } from './workout-model.js'

const customLift = { id: 'c-custom', n: 'Custom lift', custom: true }

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
  afterEach(() => registerCustom([]))

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
    it('seeds a target-less exercise with defaultConfig(exId) and appends it to routine.ex', () => {
      const res = actRoutine(S, { type: 'addExercise', routineId: 'r-push', exId: '0001' })
      expect(res.ok).toBe(true)
      const expected = { id: '0001', sets: 3, reps: 10, weight: 0, mode: 'reps', rowId: expect.any(String) }
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
      expect(S.routines[0].ex[3]).toEqual({ id: '0001', sets: 5, reps: 5, weight: 100, mode: 'reps', rowId: expect.any(String) })
    })

    it('stores no bodyweight flag that only repeats the catalogue\'s (Default decides)', () => {
      actRoutine(S, { type: 'addExercise', routineId: 'r-push', exId: '0001', target: { sets: 3, reps: 15 } })
      expect(S.routines[0].ex[3]).not.toHaveProperty('bodyweight')
      actRoutine(S, { type: 'addExercise', routineId: 'r-push', exId: '0001', target: { sets: 3, reps: 15, bodyweight: false } })
      expect(S.routines[0].ex[4].bodyweight).toBe(false)
    })

    it('sanitizes notes via cleanNote, stripping whitespace or deleting empty notes', () => {
      actRoutine(S, {
        type: 'addExercise',
        routineId: 'r-push',
        exId: '0002',
        target: { notes: '  pad height 2  ' },
      })
      expect(S.routines[0].ex[3].notes).toBe('pad height 2')

      actRoutine(S, {
        type: 'addExercise',
        routineId: 'r-push',
        exId: '0003',
        target: { notes: '     ' },
      })
      expect(S.routines[0].ex[4].notes).toBeUndefined()
    })

    it('seeds mode-specific defaults when target specifies a non-default mode', () => {
      actRoutine(S, {
        type: 'addExercise',
        routineId: 'r-push',
        exId: '0025',
        target: { mode: 'time' },
      })
      const added = S.routines[0].ex[3]
      expect(added.mode).toBe('time')
      expect(added.sec).toBe(45)
      expect(added.reps).toBeUndefined()
    })

    it('returns { ok: false } for unknown routineId or missing exId', () => {
      expect(actRoutine(S, { type: 'addExercise', routineId: 'r-unknown', exId: '0001' }).ok).toBe(false)
      expect(actRoutine(S, { type: 'addExercise', routineId: 'r-push', exId: null }).ok).toBe(false)
    })

    it('adds a registered custom exercise', () => {
      registerCustom([customLift])
      const res = actRoutine(S, { type: 'addExercise', routineId: 'r-push', exId: 'c-custom' })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[3].id).toBe('c-custom')
    })
  })

  describe('actRoutine: import', () => {
    it('adds a whole Routine with a fresh id, keeping its name, glyph and progression style', () => {
      const res = actRoutine(S, {
        type: 'import',
        routine: { id: 'foreign-id', name: 'Legs', emoji: 'legs', prog: 'linear', ex: [{ id: '0043', sets: 4, reps: 8 }] },
      })
      expect(res.ok).toBe(true)
      expect(S.routines).toHaveLength(2)
      expect(S.routines[1]).toBe(res.result)
      expect(res.result.id).not.toBe('foreign-id')
      expect(res.result.id).not.toBe('r-push')
      expect(res.result).toMatchObject({ name: 'Legs', emoji: 'legs', prog: 'linear' })
    })

    it('builds each row the way addExercise builds one, with a fresh rowId', () => {
      const rows = [
        { id: '0001', sets: 5, reps: 5, weight: 100, rowId: 'stale' },
        { id: '0025', mode: 'time', notes: '  pause  ' },
        { id: '0002' },
      ]
      const res = actRoutine(S, { type: 'import', routine: { name: 'Mixed', ex: rows } })
      const built = actRoutine(S, { type: 'create' }).result
      rows.forEach(({ id, ...target }) => actRoutine(S, { type: 'addExercise', routineId: built.id, exId: id, target }))
      const withoutRowId = (/** @type {any[]} */ ex) => ex.map(({ rowId, ...rest }) => rest)
      expect(withoutRowId(res.result.ex)).toEqual(withoutRowId(built.ex))
      expect(res.result.ex.every(e => typeof e.rowId === 'string' && e.rowId && e.rowId !== 'stale')).toBe(true)
      expect(new Set(res.result.ex.map(e => e.rowId)).size).toBe(3)
    })

    it('leaves out a progression style the Routine does not have', () => {
      const res = actRoutine(S, { type: 'import', routine: { name: 'Plain', emoji: 'barbell', ex: [] } })
      expect(res.result).not.toHaveProperty('prog')
      expect(res.result.ex).toEqual([])
    })

    it('keeps a superset pair and drops a lone superset tag', () => {
      const res = actRoutine(S, {
        type: 'import',
        routine: { name: 'SS', ex: [{ id: '0001', sg: 'a' }, { id: '0002', sg: 'a' }, { id: '0003', sg: 'b' }] },
      })
      expect(res.result.ex.map(e => e.sg)).toEqual(['a', 'a', undefined])
    })

    it('refuses a Profile with no Routine list', () => {
      expect(actRoutine({}, { type: 'import', routine: { name: 'X', ex: [] } })).toStrictEqual({ ok: false })
    })
  })

  describe('actRoutine: removeExercise', () => {
    it('splices entry and calls cleanupSg on routine.ex', () => {
      S.routines[0].ex[0].sg = 'sg-0-1'
      S.routines[0].ex[1].sg = 'sg-0-1'

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

  describe('actRoutine: purgeExercise', () => {
    it('removes the exercise from every Routine and unpairs the partner it leaves alone', () => {
      S.routines[0].ex[1].sg = 'ss-1'
      S.routines[0].ex[2].sg = 'ss-1'
      S.routines.push({ id: 'r-pull', name: 'Pull', emoji: DEFAULT_GLYPH, ex: [{ id: '0027' }, { id: '0047' }, { id: '0027' }] })

      const res = actRoutine(S, { type: 'purgeExercise', exId: '0027' })

      expect(res.ok).toBe(true)
      expect(S.routines[0].ex.map(e => e.id)).toEqual(['0025', '0026'])
      expect(S.routines[0].ex[1].sg).toBeUndefined()
      expect(S.routines[1].ex.map(e => e.id)).toEqual(['0047'])
    })

    it('keeps a superset paired when two partners stay adjacent', () => {
      S.routines[0].ex.forEach(e => { e.sg = 'ss-3' })

      actRoutine(S, { type: 'purgeExercise', exId: '0026' })

      expect(S.routines[0].ex.map(e => [e.id, e.sg])).toEqual([['0025', 'ss-3'], ['0027', 'ss-3']])
    })

    it('refuses without an exercise id and changes nothing', () => {
      const before = JSON.stringify(S)
      expect(actRoutine(S, { type: 'purgeExercise' }).ok).toBe(false)
      expect(JSON.stringify(S)).toBe(before)
    })
  })

  describe('actRoutine: moveExercise', () => {
    it('checks bounds, swaps entries, and calls cleanupSg(routine.ex)', () => {
      S.routines[0].ex[0].sg = 'sg-0-1'
      S.routines[0].ex[1].sg = 'sg-0-1'

      const res1 = actRoutine(S, { type: 'moveExercise', routineId: 'r-push', index: 0, dir: 1 })
      expect(res1.ok).toBe(true)
      expect(S.routines[0].ex[0].id).toBe('0026')
      expect(S.routines[0].ex[1].id).toBe('0025')
      expect(S.routines[0].ex[0].sg).toBe('sg-0-1')
      expect(S.routines[0].ex[1].sg).toBe('sg-0-1')

      const res2 = actRoutine(S, { type: 'moveExercise', routineId: 'r-push', index: 2, dir: -1 })
      expect(res2.ok).toBe(true)
      expect(S.routines[0].ex.map(e => e.id)).toEqual(['0026', '0027', '0025'])
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
      expect(S.routines[0].ex[0].notes).toBe('Bench cue')
      S.routines[0].ex[0].sg = 'sg-0-1'
      S.routines[0].ex[1].sg = 'sg-0-1'

      const res = actRoutine(S, {
        type: 'replaceExercise',
        routineId: 'r-push',
        index: 0,
        exId: '0028',
        target: { sets: 4, reps: 6, weight: 80 },
      })

      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0].id).toBe('0028')
      expect(S.routines[0].ex[0].sets).toBe(4)
      expect(S.routines[0].ex[0].reps).toBe(6)
      expect(S.routines[0].ex[0].weight).toBe(80)
      expect(S.routines[0].ex[0].notes).toBeUndefined()
      expect(S.routines[0].ex[0].sg).toBe('sg-0-1')
      expect(S.routines[0].ex[1].sg).toBe('sg-0-1')
    })

    it('sanitizes any new notes provided during replacement', () => {
      actRoutine(S, {
        type: 'replaceExercise',
        routineId: 'r-push',
        index: 0,
        exId: '0028',
        target: { notes: '  incline angle 30  ' },
      })
      expect(S.routines[0].ex[0].notes).toBe('incline angle 30')
    })

    it('returns { ok: false } for invalid index or unknown routine', () => {
      expect(actRoutine(S, { type: 'replaceExercise', routineId: 'r-push', index: -1, exId: '0028' }).ok).toBe(false)
      expect(actRoutine(S, { type: 'replaceExercise', routineId: 'r-push', index: 10, exId: '0028' }).ok).toBe(false)
      expect(actRoutine(S, { type: 'replaceExercise', routineId: 'r-unknown', index: 0, exId: '0028' }).ok).toBe(false)
    })
  })

  describe('actRoutine: toggleSuperset', () => {
    it('pairs adjacent exercises when unpaired, and unpairs when already paired, calling cleanupSg', () => {
      expect(S.routines[0].ex[0].sg).toBeUndefined()
      expect(S.routines[0].ex[1].sg).toBeUndefined()

      const resPair = actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 0 })
      expect(resPair.ok).toBe(true)
      expect(S.routines[0].ex[0].sg).toBeDefined()
      expect(S.routines[0].ex[1].sg).toBe(S.routines[0].ex[0].sg)

      const resUnpair = actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 0 })
      expect(resUnpair.ok).toBe(true)
      expect(S.routines[0].ex[0].sg).toBeUndefined()
      expect(S.routines[0].ex[1].sg).toBeUndefined()
    })

    it('returns { ok: false } when index is out of bounds', () => {
      expect(actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 2 }).ok).toBe(false)
      expect(actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: -1 }).ok).toBe(false)
      expect(actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 3 }).ok).toBe(false)
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
      expect(S.routines[0].ex.map(({ rowId, ...rest }) => rest)).toEqual(syncedEx)
      expect(S.routines[0].ex.every(e => typeof e.rowId === 'string' && e.rowId)).toBe(true)
      expect(S.routines[0].ex).not.toBe(syncedEx)
      expect(S.routines[0].ex[0]).not.toBe(syncedEx[0])
    })

    it('returns { ok: false } for unknown routine or non-array syncedEx or missing state', () => {
      expect(actRoutine(S, { type: 'syncFromSession', routineId: 'r-unknown', syncedEx: [] }).ok).toBe(false)
      expect(actRoutine(S, { type: 'syncFromSession', routineId: 'r-push', syncedEx: null }).ok).toBe(false)
      expect(actRoutine(null, { type: 'syncFromSession', routineId: 'r-push', syncedEx: [] }).ok).toBe(false)
      expect(actRoutine({}, { type: 'syncFromSession', routineId: 'r-push', syncedEx: [] }).ok).toBe(false)
      expect(actRoutine({ routines: null }, { type: 'syncFromSession', routineId: 'r-push', syncedEx: [] }).ok).toBe(false)
    })
  })

  describe('actRoutine: replaceExercise (sheet update with same exercise id)', () => {
    it('updates configuration of an existing exercise in place, applying defaultConfig and sanitizing notes', () => {
      const res = actRoutine(S, {
        type: 'replaceExercise',
        routineId: 'r-push',
        index: 0,
        exId: '0025',
        target: { sets: 5, weight: 70, notes: '  wrist wraps on  ' },
      })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0].id).toBe('0025')
      expect(S.routines[0].ex[0].sets).toBe(5)
      expect(S.routines[0].ex[0].reps).toBe(10)
      expect(S.routines[0].ex[0].weight).toBe(70)
      expect(S.routines[0].ex[0].mode).toBe('reps')
      expect(S.routines[0].ex[0].notes).toBe('wrist wraps on')

      actRoutine(S, {
        type: 'replaceExercise',
        routineId: 'r-push',
        index: 0,
        exId: '0025',
        target: { notes: '   ' },
      })
      expect(S.routines[0].ex[0].notes).toBeUndefined()
    })

    it('replaces the entry with target and defaultConfig, preserving sg and notes', () => {
      S.routines[0].ex[0].sg = 'sg-a'
      S.routines[0].ex[1].sg = 'sg-a'
      S.routines[0].ex[0].side = true
      S.routines[0].ex[0].rest = 150
      S.routines[0].ex[0].rowId = 'row-bench'

      const res = actRoutine(S, {
        type: 'replaceExercise',
        routineId: 'r-push',
        index: 0,
        exId: '0025',
        target: { sets: 4, weight: 65, notes: 'New cue' },
      })

      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0]).toEqual({
        id: '0025',
        ...defaultConfig('0025'),
        sets: 4,
        weight: 65,
        sg: 'sg-a',
        notes: 'New cue',
        rowId: 'row-bench',
      })
    })

    it('defaults exId to existing exercise id when command.exId is omitted', () => {
      const res = actRoutine(S, {
        type: 'replaceExercise',
        routineId: 'r-push',
        index: 0,
        target: { sets: 5, reps: 8, weight: 70 },
      })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0].id).toBe('0025')
      expect(S.routines[0].ex[0].sets).toBe(5)
      expect(S.routines[0].ex[0].reps).toBe(8)
      expect(S.routines[0].ex[0].weight).toBe(70)
    })

    it('ignores any id passed inside target object', () => {
      const res = actRoutine(S, {
        type: 'replaceExercise',
        routineId: 'r-push',
        index: 0,
        exId: '0025',
        target: { id: '9999', sets: 4, weight: 65 },
      })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0].id).toBe('0025')
    })

    it('returns { ok: false } when exId is missing and existing entry has no id', () => {
      S.routines[0].ex[0] = {}
      expect(actRoutine(S, { type: 'replaceExercise', routineId: 'r-push', index: 0 }).ok).toBe(false)
    })

    it('replaces with a registered custom exercise', () => {
      registerCustom([customLift])
      const res = actRoutine(S, { type: 'replaceExercise', routineId: 'r-push', index: 0, exId: 'c-custom' })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0].id).toBe('c-custom')
    })

    it('keeps an unknown current exercise when replace omits the id', () => {
      S.routines[0].ex[0] = { id: 'deleted-custom', sets: 3, reps: 8, weight: 60, mode: 'reps' }
      const res = actRoutine(S, {
        type: 'replaceExercise',
        routineId: 'r-push',
        index: 0,
        target: { sets: 5, weight: 70 },
      })
      expect(res.ok).toBe(true)
      expect(S.routines[0].ex[0].id).toBe('deleted-custom')
      expect(S.routines[0].ex[0].sets).toBe(5)
      expect(S.routines[0].ex[0].weight).toBe(70)
    })
  })

  describe('a refused command', () => {
    it.each([
      ['addExercise with no id', { type: 'addExercise', routineId: 'r-push' }],
      ['addExercise with an unknown id', { type: 'addExercise', routineId: 'r-push', exId: 'no-such-exercise' }],
      ['addExercise with an id the index only inherits', { type: 'addExercise', routineId: 'r-push', exId: 'constructor' }],
      ['replaceExercise with an unknown id', { type: 'replaceExercise', routineId: 'r-push', index: 0, exId: 'no-such-exercise' }],
      ['replaceExercise with an id the index only inherits', { type: 'replaceExercise', routineId: 'r-push', index: 0, exId: 'constructor' }],
    ])('%s leaves the Routine unchanged', (_, command) => {
      const before = structuredClone(S)
      expect(actRoutine(S, command)).toStrictEqual({ ok: false })
      expect(S).toStrictEqual(before)
    })
  })

  describe('actRoutine error handling', () => {
    it('throws only on unknown command type', () => {
      expect(() => actRoutine(S, { type: 'unrecognized_cmd' })).toThrow(/Unknown Routine command/)
      expect(() => actRoutine(S, { type: 'updateExercise' })).toThrow(/Unknown Routine command/)
    })

    it('gracefully returns { ok: false } for null state or missing routines', () => {
      expect(actRoutine(null, { type: 'delete', routineId: 'r-push' }).ok).toBe(false)
      expect(actRoutine({}, { type: 'delete', routineId: 'r-push' }).ok).toBe(false)
      expect(actRoutine({ routines: null }, { type: 'delete', routineId: 'r-push' }).ok).toBe(false)
    })
  })

  describe('routineView(routine)', () => {
    it('derives isLinkedPrev, inSuperset, isFirstInSuperset and hasNote for each entry', () => {
      const routine = {
        id: 'r1',
        name: 'Upper',
        ex: [
          { id: '0001', sg: 'sg-1', notes: 'First exercise note' },
          { id: '0002', sg: 'sg-1', notes: '   ' },
          { id: '0003' },
        ],
      }

      const view = routineView(routine)
      expect(view.entries).toHaveLength(3)

      expect(view.entries[0].id).toBe('0001')
      expect(view.entries[0].isLinkedPrev).toBe(false)
      expect(view.entries[0].inSuperset).toBe(true)
      expect(view.entries[0].isFirstInSuperset).toBe(true)
      expect(view.entries[0].hasNote).toBe(true)

      expect(view.entries[1].id).toBe('0002')
      expect(view.entries[1].isLinkedPrev).toBe(true)
      expect(view.entries[1].inSuperset).toBe(true)
      expect(view.entries[1].isFirstInSuperset).toBe(false)
      expect(view.entries[1].hasNote).toBe(false)

      expect(view.entries[2].id).toBe('0003')
      expect(view.entries[2].isLinkedPrev).toBe(false)
      expect(view.entries[2].inSuperset).toBe(false)
      expect(view.entries[2].isFirstInSuperset).toBe(false)
      expect(view.entries[2].hasNote).toBe(false)
    })

    it('handles nullish routine gracefully', () => {
      const view = routineView(null)
      expect(view).toEqual({ entries: [] })
    })
  })
})

describe('editing a Routine during an Active workout', () => {
  it('leaves the Active workout as it was', () => {
    const S = {
      unit: 'kg', restSec: 90, workouts: [], exWeights: {}, bodyweight: [], week: {}, dayPlan: {},
      routines: [{
        id: 'r-push', name: 'Push Day', ex: [
          { id: '0025', sets: 3, reps: 8, weight: 60, mode: 'reps', sg: 's1', notes: 'Bench cue' },
          { id: '0026', sets: 3, reps: 10, weight: 50, mode: 'reps', sg: 's1' },
          { id: '0027', sets: 3, reps: 12, weight: 15, mode: 'reps' },
        ],
      }],
    }
    act(S, { type: 'begin', routineId: 'r-push', bw: 80 })
    const before = structuredClone(S.active)

    actRoutine(S, { type: 'replaceExercise', routineId: 'r-push', index: 2, target: { sets: 5, reps: 5, weight: 20, notes: 'New cue' } })
    actRoutine(S, { type: 'removeExercise', routineId: 'r-push', index: 0 })
    actRoutine(S, { type: 'toggleSuperset', routineId: 'r-push', index: 0 })
    actRoutine(S, { type: 'rename', routineId: 'r-push', name: 'Pull Day' })

    expect(S.active).toStrictEqual(before)
  })
})
