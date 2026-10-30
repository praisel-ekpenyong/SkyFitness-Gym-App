import { describe, expect, it } from 'vitest'
import { evaluateSetMilestone } from './milestones.js'

describe('evaluateSetMilestone', () => {
  describe('Linear progression', () => {
    it('returns a hit milestone descriptor when a work set meets target reps', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        sets: [
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: false }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '5/5 reps',
        reps: 5,
        targetReps: 5
      })
    })

    it('returns a hit milestone descriptor when a work set exceeds target reps', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        sets: [
          { r: 6, w: 60, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '6/5 reps',
        reps: 6,
        targetReps: 5
      })
    })

    it('returns null when a completed work set falls short of target reps', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        sets: [
          { r: 4, w: 60, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0)
      expect(milestone).toBeNull()
    })

    it('returns null when a work set is not done (uncompleted)', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        sets: [
          { r: 5, w: 60, done: false }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0)
      expect(milestone).toBeNull()
    })

    it('returns null when a warm-up set meets or exceeds target reps', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        sets: [
          { r: 5, w: 20, done: true, phase: 'warmup' },
          { r: 5, w: 60, done: true }
        ]
      }
      const warmupMilestone = evaluateSetMilestone(entry, 0)
      expect(warmupMilestone).toBeNull()

      const workMilestone = evaluateSetMilestone(entry, 1)
      expect(workMilestone).toEqual({
        kind: 'hit',
        label: '5/5 reps',
        reps: 5,
        targetReps: 5
      })
    })

    it('returns null when progression policy is explicitly off', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'off' },
        sets: [
          { r: 5, w: 60, done: true }
        ]
      }
      expect(evaluateSetMilestone(entry, 0)).toBeNull()
    })

    it('defaults to linear progression for reps-mode exercises when no policy is set', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 8, weight: 50 },
        sets: [
          { r: 8, w: 50, done: true }
        ]
      }
      expect(evaluateSetMilestone(entry, 0)).toEqual({
        kind: 'hit',
        label: '8/8 reps',
        reps: 8,
        targetReps: 8
      })
    })
  })

  describe('Add-time (timed hold) progression', () => {
    it('returns a hit milestone descriptor when a timed hold set meets target seconds', () => {
      const entry = {
        id: 'plank',
        target: { mode: 'time', sec: 45, prog: 'time' },
        sets: [
          { sec: 45, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '45s hold',
        sec: 45,
        targetSec: 45
      })
    })

    it('returns a hit milestone descriptor when a timed hold set exceeds target seconds', () => {
      const entry = {
        id: 'plank',
        target: { mode: 'time', sec: 45, prog: 'time' },
        sets: [
          { sec: 50, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '50s hold',
        sec: 50,
        targetSec: 45
      })
    })

    it('returns null when a timed hold set falls short of target seconds', () => {
      const entry = {
        id: 'plank',
        target: { mode: 'time', sec: 45, prog: 'time' },
        sets: [
          { sec: 40, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0)
      expect(milestone).toBeNull()
    })

    it('returns null when a timed hold set is not completed', () => {
      const entry = {
        id: 'plank',
        target: { mode: 'time', sec: 45, prog: 'time' },
        sets: [
          { sec: 45, done: false }
        ]
      }
      expect(evaluateSetMilestone(entry, 0)).toBeNull()
    })

    it('returns null for warm-up timed hold sets', () => {
      const entry = {
        id: 'plank',
        target: { mode: 'time', sec: 45, prog: 'time' },
        sets: [
          { sec: 45, done: true, phase: 'warmup' }
        ]
      }
      expect(evaluateSetMilestone(entry, 0)).toBeNull()
    })

    it('evaluates timed hold with implicit or explicit time progression', () => {
      const entry = {
        id: 'plank',
        target: { mode: 'time', sec: 60 },
        sets: [
          { sec: 60, done: true }
        ]
      }
      expect(evaluateSetMilestone(entry, 0)).toEqual({
        kind: 'hit',
        label: '60s hold',
        sec: 60,
        targetSec: 60
      })
    })

    it('returns null when timed exercise progression is explicitly off', () => {
      const entry = {
        id: 'plank',
        target: { mode: 'time', sec: 45, prog: 'off' },
        sets: [
          { sec: 45, done: true }
        ]
      }
      expect(evaluateSetMilestone(entry, 0)).toBeNull()
    })
  })

  describe('Edge cases and stability', () => {
    it('returns null for missing, invalid, or out-of-range inputs', () => {
      expect(evaluateSetMilestone(null, 0)).toBeNull()
      expect(evaluateSetMilestone({}, 0)).toBeNull()
      expect(evaluateSetMilestone({ sets: [] }, 0)).toBeNull()
      expect(evaluateSetMilestone({ sets: [{ done: true }] }, -1)).toBeNull()
      expect(evaluateSetMilestone({ sets: [{ done: true }] }, 2)).toBeNull()
      expect(evaluateSetMilestone({ target: { reps: 0 }, sets: [{ r: 5, done: true }] }, 0)).toBeNull()
    })

    it('does not mutate the entry or its sets', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear' },
        sets: [
          { r: 5, w: 60, done: true }
        ]
      }
      const snapshot = JSON.stringify(entry)
      evaluateSetMilestone(entry, 0)
      expect(JSON.stringify(entry)).toBe(snapshot)
    })
  })
})
