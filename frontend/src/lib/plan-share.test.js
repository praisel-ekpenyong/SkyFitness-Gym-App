import { describe, it, expect } from 'vitest'
import { buildPlanBundle, parsePlan, mergePlan, planPrintHTML } from './plan-share.js'
import { EXDB } from './exercises.js'

const BARBELL_BENCH = EXDB.find(e => e.bp === 'chest' && e.eq === 'barbell')?.id || '0025'
const PUSH_UP = EXDB.find(e => e.eq === 'body weight')?.id || '0047'
const CARDIO = EXDB.find(e => e.bp === 'cardio')?.id || '2330'

describe('plan-share engine', () => {
  describe('buildPlanBundle', () => {
    it('creates a sanitized plan bundle with referenced customs and ordered week schedule', () => {
      const S = {
        routines: [
          {
            id: 'r1',
            name: 'Push Day',
            emoji: 'chest',
            prog: 'linear',
            ex: [
              { id: BARBELL_BENCH, sets: 3, reps: 10, weight: 60, prog: 'linear', inc: 2.5 },
              { id: 'custom-1', sets: 3, sec: 45, mode: 'time', sg: 'sg-1' },
              { id: PUSH_UP, sets: 3, reps: 16, side: true, bodyweight: true },
            ],
          },
        ],
        customEx: [
          { id: 'custom-1', n: 'Special Plank', bp: 'waist', tg: 'abs', sm: ['obliques'], desc: 'Hold tight', eq: 'custom', custom: true },
          { id: 'custom-unreferenced', n: 'Ignored', bp: 'legs' },
        ],
        week: {
          1: 'r1',
          3: 'r1',
        },
      }

      const bundle = buildPlanBundle(S, 'My PPL Plan')
      expect(bundle.opengym_plan).toBe(1)
      expect(bundle.name).toBe('My PPL Plan')
      expect(bundle.routines.length).toBe(1)
      expect(bundle.routines[0].name).toBe('Push Day')
      expect(bundle.routines[0].ex[1].mode).toBe('time')
      expect(bundle.routines[0].ex[1].sec).toBe(45)
      expect(bundle.routines[0].ex[2].side).toBe(true)

      // Only referenced custom exercises should be included with muscle metadata preserved
      expect(bundle.customEx.length).toBe(1)
      expect(bundle.customEx[0].id).toBe('custom-1')
      expect(bundle.customEx[0].n).toBe('Special Plank')
      expect(bundle.customEx[0].tg).toBe('abs')
      expect(bundle.customEx[0].sm).toEqual(['obliques'])

      expect(bundle.week).toEqual({ 1: 'r1', 3: 'r1' })
    })

    it('excludes favorites array from the exported shareable plan bundle payload', () => {
      const S = {
        routines: [
          {
            id: 'r1',
            name: 'Push Day',
            ex: [{ id: BARBELL_BENCH, sets: 3, reps: 10, weight: 60 }],
          },
        ],
        customEx: [],
        week: { 1: 'r1' },
        favorites: [BARBELL_BENCH, 'custom-1', '0047'],
      }

      const bundle = buildPlanBundle(S, 'Favorites-Excluded Plan')
      expect(bundle.favorites).toBeUndefined()
      expect(Object.keys(bundle).sort()).toEqual([
        'customEx',
        'exported',
        'name',
        'opengym_plan',
        'routines',
        'week',
      ])
    })

    it('coerces string secondary muscles to array so single-sm customs survive export', () => {
      // Legacy customs may store sm as a single string rather than an array;
      // buildPlanBundle must normalize it so the friend sees the secondary tag.
      const S = {
        routines: [{ id: 'r1', name: 'Back Day', ex: [{ id: 'custom-str', sets: 3, reps: 10 }] }],
        customEx: [
          { id: 'custom-str', n: 'String Sm Lift', bp: 'back', tg: 'lats', sm: 'upper-back', eq: 'custom', custom: true },
          { id: 'custom-arr', n: 'Array Sm Lift', bp: 'back', tg: 'upper-back', sm: ['lats'], eq: 'custom', custom: true },
          { id: 'custom-empty', n: 'No Sm Lift', bp: 'chest', sm: '', eq: 'custom', custom: true },
        ],
        week: { 1: 'r1' },
      }
      // Only custom-str is referenced; the coercion is verified via a second full bundle
      const S2 = {
        routines: [{ id: 'r1', name: 'All Customs', ex: [{ id: 'custom-str', sets: 3 }, { id: 'custom-arr', sets: 3 }, { id: 'custom-empty', sets: 3 }] }],
        customEx: S.customEx,
        week: { 1: 'r1' },
      }
      const bundle = buildPlanBundle(S2, 'Array Coercion Plan')
      const str = bundle.customEx.find(c => c.id === 'custom-str')
      const arr = bundle.customEx.find(c => c.id === 'custom-arr')
      const emp = bundle.customEx.find(c => c.id === 'custom-empty')
      expect(str.sm).toEqual(['upper-back'])
      expect(arr.sm).toEqual(['lats'])
      expect(emp.sm).toBeUndefined()
    })
  })

  describe('parsePlan', () => {
    it('throws error when importing malformed data or wrong format', () => {
      expect(() => parsePlan(null)).toThrow(/Sky plan file/)
      expect(() => parsePlan('{"foo": 123}')).toThrow(/Sky plan file/)
      expect(() => parsePlan({ opengym_plan: 1, routines: 'not-an-array' })).toThrow(/Sky plan file/)
    })

    it('filters out unresolvable exercise IDs and records dropped count', () => {
      const raw = JSON.stringify({
        opengym_plan: 1,
        name: 'Shared Routine',
        routines: [
          {
            id: 'r-foreign',
            name: 'Chest & Arms',
            ex: [
              { id: BARBELL_BENCH, sets: 3, reps: 8 },
              { id: 'missing-nonexistent-id', sets: 3, reps: 10 },
              { id: 'custom-foreign', sets: 3, reps: 12 },
            ],
          },
        ],
        customEx: [
          { id: 'custom-foreign', n: 'Foreign Custom', bp: 'arms' },
        ],
        week: { 1: 'r-foreign' },
      })

      const parsed = parsePlan(raw)
      expect(parsed.name).toBe('Shared Routine')
      expect(parsed.dropped).toBe(1)
      expect(parsed.routineCount).toBe(1)
      expect(parsed.exerciseCount).toBe(2)
      expect(parsed.scheduledDays).toBe(1)
      expect(parsed.routines[0].ex.map(e => e.id)).toEqual([BARBELL_BENCH, 'custom-foreign'])
    })
  })

  describe('mergePlan', () => {
    it('merges routines with fresh IDs and deduplicates identical custom exercises', () => {
      const state = {
        routines: [{ id: 'existing-r1', name: 'Existing Routine', ex: [] }],
        customEx: [{ id: 'existing-c1', n: 'Plate Pinch', bp: 'forearms' }],
        week: { 1: 'existing-r1' },
      }

      const bundle = {
        name: 'Friend Plan',
        routines: [
          {
            id: 'foreign-r1',
            name: 'Grip Strength',
            ex: [
              { id: 'foreign-c1', sets: 3, reps: 10 },
              { id: 'foreign-c2', sets: 3, reps: 10 },
            ],
          },
        ],
        customEx: [
          { id: 'foreign-c1', n: 'plate pinch', bp: 'forearms' }, // duplicate (case-insensitive + same bp)
          { id: 'foreign-c2', n: 'Towel Pull Up', bp: 'back', tg: 'upper-back', sm: ['forearm', 'biceps'] },   // new custom
        ],
        week: { 2: 'foreign-r1' },
      }

      const res = mergePlan(state, bundle, { schedule: false })
      expect(res.routines).toBe(1)
      expect(state.routines.length).toBe(2)
      expect(state.routines[1].id).not.toBe('foreign-r1')
      expect(state.routines[1].name).toBe('Grip Strength')

      // Custom exercise deduplication:
      // existing-c1 reused, foreign-c2 added
      expect(state.customEx.length).toBe(2)
      const addedCustom = state.customEx.find(c => c.n === 'Towel Pull Up')
      expect(addedCustom).toBeDefined()
      expect(addedCustom.tg).toBe('upper-back')
      expect(addedCustom.sm).toEqual(['forearm', 'biceps'])

      // Merged routine rewired to use existing-c1 and newly generated custom ID
      expect(state.routines[1].ex[0].id).toBe('existing-c1')
      expect(state.routines[1].ex[1].id).toBe(addedCustom.id)

      // Schedule preserved when schedule is false
      expect(state.week).toEqual({ 1: 'existing-r1' })
    })

    it('replaces weekly schedule when schedule: true is requested', () => {
      const state = {
        routines: [{ id: 'r0', name: 'My Leg Day', ex: [] }],
        customEx: [],
        week: { 1: 'r0', 2: 'r0' },
      }

      const bundle = {
        name: 'New Schedule',
        routines: [{ id: 'foreign-r1', name: 'Full Body', ex: [] }],
        customEx: [],
        week: { 3: 'foreign-r1', 5: 'foreign-r1' },
      }

      mergePlan(state, bundle, { schedule: true })
      const newRoutineId = state.routines.find(r => r.name === 'Full Body').id
      expect(state.week).toEqual({ 3: newRoutineId, 5: newRoutineId })
    })

    it('preserves existing favorites in receiver state untouched', () => {
      const state = {
        routines: [{ id: 'r0', name: 'My Leg Day', ex: [] }],
        customEx: [],
        week: { 1: 'r0' },
        favorites: ['0025', '0047'],
      }

      const bundle = {
        name: 'Friend Plan',
        routines: [{ id: 'foreign-r1', name: 'Full Body', ex: [] }],
        customEx: [],
        week: { 3: 'foreign-r1' },
      }

      mergePlan(state, bundle, { schedule: false })
      expect(state.favorites).toEqual(['0025', '0047'])
    })

    it('coerces string secondary muscles to array on import merge', () => {
      const state = { routines: [], customEx: [], week: {} }
      const bundle = {
        name: 'String Sm Import',
        routines: [{ id: 'foreign-r1', name: 'Imported', ex: [{ id: 'foreign-c1', sets: 3, reps: 10 }] }],
        customEx: [{ id: 'foreign-c1', n: 'String Sm Import', bp: 'back', tg: 'lats', sm: 'upper-back' }],
        week: { 1: 'foreign-r1' },
      }
      mergePlan(state, bundle, { schedule: false })
      expect(state.customEx).toHaveLength(1)
      expect(state.customEx[0].sm).toEqual(['upper-back'])
      // idempotent on array input as well
      const state2 = { routines: [], customEx: [], week: {} }
      const bundle2 = {
        name: 'Array Sm Import',
        routines: [{ id: 'foreign-r1', name: 'Imported', ex: [{ id: 'foreign-c2', sets: 3 }] }],
        customEx: [{ id: 'foreign-c2', n: 'Array Sm Import', bp: 'back', tg: 'upper-back', sm: ['lats', 'biceps'] }],
        week: {},
      }
      mergePlan(state2, bundle2, { schedule: false })
      expect(state2.customEx[0].sm).toEqual(['lats', 'biceps'])
    })
  })

  describe('planPrintHTML', () => {
    it('generates a self-contained HTML document with supersets and pagination styling', () => {
      const S = {
        unit: 'kg',
        routines: [
          {
            id: 'r1',
            name: 'Chest & Back Superset',
            ex: [
              { id: BARBELL_BENCH, sets: 3, reps: 10, weight: 80, sg: 'sg-1' },
              { id: PUSH_UP, sets: 3, reps: 16, side: true, sg: 'sg-1' },
              { id: CARDIO, sets: 1, min: 20, speed: 10 },
            ],
          },
        ],
        week: { 1: 'r1' },
      }

      const html = planPrintHTML(S, 'Alex')
      expect(html).toContain('<!doctype html>')
      expect(html).toContain('Weekly Training Plan')
      expect(html).toContain('Chest &amp; Back Superset')
      expect(html).toContain('page-break-inside: avoid')
      expect(html).toContain('Superset')
      expect(html).toContain('20 min @ 10 km/h')
      expect(html).toContain('Alex')
    })

    it('renders placeholder when no routines exist', () => {
      const html = planPrintHTML({ routines: [] })
      expect(html).toContain('No routines yet.')
    })
  })
})
