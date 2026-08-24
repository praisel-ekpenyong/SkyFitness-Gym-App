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
          { id: 'custom-1', n: 'Special Plank', bp: 'abs', desc: 'Hold tight' },
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

      // Only referenced custom exercises should be included
      expect(bundle.customEx.length).toBe(1)
      expect(bundle.customEx[0].id).toBe('custom-1')
      expect(bundle.customEx[0].n).toBe('Special Plank')

      expect(bundle.week).toEqual({ 1: 'r1', 3: 'r1' })
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
          { id: 'foreign-c2', n: 'Towel Pull Up', bp: 'back' },   // new custom
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
