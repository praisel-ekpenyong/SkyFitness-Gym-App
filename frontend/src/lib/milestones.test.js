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

  describe('Double progression', () => {
    it('returns an on-track milestone descriptor when an intermediate work set meets the rep ceiling', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double' },
        sets: [
          { r: 12, w: 14, done: true },
          { r: 10, w: 14, done: false },
          { r: 8, w: 14, done: false }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '12/12 reps · On track',
        reps: 12,
        targetReps: 12
      })
    })

    it('returns an on-track milestone descriptor when an intermediate work set exceeds the rep ceiling', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double' },
        sets: [
          { r: 13, w: 14, done: true },
          { r: 10, w: 14, done: false }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '13/12 reps · On track',
        reps: 13,
        targetReps: 12
      })
    })

    it('returns an unlocked milestone descriptor on the final planned work set when all work sets hit the rep ceiling at working load', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double' },
        sets: [
          { r: 12, w: 14, done: true },
          { r: 12, w: 14, done: true },
          { r: 12, w: 14, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 2, { unit: 'kg', inc: 2.5 })
      expect(milestone).toEqual({
        kind: 'unlocked',
        label: 'All sets hit! +2.5 kg unlocked next session',
        inc: 2.5,
        unit: 'kg',
        reps: 12,
        targetReps: 12
      })
    })

    it('returns unlocked milestone with custom increment and active lb unit', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 30, prog: 'double', inc: 5 },
        sets: [
          { r: 12, w: 30, done: true },
          { r: 12, w: 30, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 1, { unit: 'lb' })
      expect(milestone).toEqual({
        kind: 'unlocked',
        label: 'All sets hit! +5 lb unlocked next session',
        inc: 5,
        unit: 'lb',
        reps: 12,
        targetReps: 12
      })
    })

    it('returns hit milestone (not unlocked) on final set if an earlier work set missed the rep ceiling', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double' },
        sets: [
          { r: 10, w: 14, done: true },
          { r: 12, w: 14, done: true },
          { r: 12, w: 14, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 2)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '12/12 reps',
        reps: 12,
        targetReps: 12
      })
    })

    it('returns hit milestone (not unlocked) on final set if an earlier work set was performed below working load', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double' },
        sets: [
          { r: 12, w: 12, done: true }, // lower weight
          { r: 12, w: 14, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 1)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '12/12 reps',
        reps: 12,
        targetReps: 12
      })
    })

    it('returns hit milestone (not unlocked) on final set if an earlier work set is uncompleted', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double' },
        sets: [
          { r: 12, w: 14, done: false },
          { r: 12, w: 14, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 1)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '12/12 reps',
        reps: 12,
        targetReps: 12
      })
    })

    it('returns a rep progress milestone when a set falls short of rep ceiling but meets rep progress aim', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double' },
        sets: [
          { r: 9, w: 14, done: true }
        ]
      }
      // Previous weakest set was 8 reps. Aim is 8 + 1 = 9 reps.
      const milestone = evaluateSetMilestone(entry, 0, { prevWeakest: 8 })
      expect(milestone).toEqual({
        kind: 'progress',
        label: 'Rep progress (+1)',
        step: 1,
        reps: 9,
        targetReps: 12
      })
    })

    it('returns a rep progress milestone with step 2 for unilateral exercises', () => {
      const entry = {
        id: 'dumbbell-lunge',
        target: { mode: 'reps', reps: 24, repsMin: 16, weight: 10, prog: 'double', side: true },
        sets: [
          { r: 18, w: 10, done: true }
        ]
      }
      // Previous weakest set was 16 total reps. Unilateral repStep is 2 -> aim is 18 reps.
      const milestone = evaluateSetMilestone(entry, 0, { prevWeakest: 16 })
      expect(milestone).toEqual({
        kind: 'progress',
        label: 'Rep progress (+2)',
        step: 2,
        reps: 18,
        targetReps: 24
      })
    })

    it('returns null when a set falls short of rep progress aim', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double' },
        sets: [
          { r: 8, w: 14, done: true }
        ]
      }
      // Previous weakest set was 8 reps. Aim is 9 reps. 8 reps falls short.
      expect(evaluateSetMilestone(entry, 0, { prevWeakest: 8 })).toBeNull()
    })

    it('returns null for warm-up sets under double progression', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double' },
        sets: [
          { r: 12, w: 6, done: true, phase: 'warmup' },
          { r: 12, w: 14, done: true }
        ]
      }
      expect(evaluateSetMilestone(entry, 0)).toBeNull()
    })

    it('immediately unlocks on a single-set double progression exercise when hitting rep ceiling', () => {
      const entry = {
        id: 'dumbbell-curl',
        target: { mode: 'reps', reps: 12, repsMin: 8, weight: 14, prog: 'double', sets: 1 },
        sets: [
          { r: 12, w: 14, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 0, { unit: 'kg', inc: 2.5 })
      expect(milestone).toEqual({
        kind: 'unlocked',
        label: 'All sets hit! +2.5 kg unlocked next session',
        inc: 2.5,
        unit: 'kg',
        reps: 12,
        targetReps: 12
      })
    })
  })

  describe('Greyskull LP progression', () => {
    it('returns hit milestone for intermediate work sets meeting target reps', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'greyskull', sets: 3 },
        sets: [
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: false },
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

    it('returns null for intermediate work sets falling short of target reps', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'greyskull', sets: 3 },
        sets: [
          { r: 4, w: 60, done: true }
        ]
      }
      expect(evaluateSetMilestone(entry, 0)).toBeNull()
    })

    it('returns AMRAP target-beaten milestone cue when final set exceeds target reps', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'greyskull', sets: 3 },
        sets: [
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: true },
          { r: 8, w: 60, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 2)
      expect(milestone).toEqual({
        kind: 'bonus',
        label: 'AMRAP +3',
        reps: 8,
        targetReps: 5,
        bonusReps: 3
      })
    })

    it('returns double increment unlocked milestone cue when final AMRAP set doubles target reps', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'greyskull', sets: 3 },
        sets: [
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: true },
          { r: 10, w: 60, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 2, { unit: 'kg', inc: 2.5 })
      expect(milestone).toEqual({
        kind: 'bonus',
        label: 'Double increment unlocked! (+5 kg)',
        reps: 10,
        targetReps: 5,
        bonusReps: 5,
        doubleIncrement: true,
        inc: 5,
        unit: 'kg'
      })
    })

    it('returns double increment unlocked milestone with lb units', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 135, prog: 'greyskull', sets: 3, inc: 5 },
        sets: [
          { r: 5, w: 135, done: true },
          { r: 5, w: 135, done: true },
          { r: 11, w: 135, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 2, { unit: 'lb' })
      expect(milestone).toEqual({
        kind: 'bonus',
        label: 'Double increment unlocked! (+10 lb)',
        reps: 11,
        targetReps: 5,
        bonusReps: 6,
        doubleIncrement: true,
        inc: 10,
        unit: 'lb'
      })
    })

    it('returns standard hit milestone when final AMRAP set matches target reps exactly', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'greyskull', sets: 3 },
        sets: [
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 2)
      expect(milestone).toEqual({
        kind: 'hit',
        label: '5/5 reps',
        reps: 5,
        targetReps: 5
      })
    })

    it('returns null when final AMRAP set falls short of target reps', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'greyskull', sets: 3 },
        sets: [
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: true },
          { r: 4, w: 60, done: true }
        ]
      }
      expect(evaluateSetMilestone(entry, 2)).toBeNull()
    })

    it('returns null for warm-up sets under Greyskull LP', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'greyskull', sets: 3 },
        sets: [
          { r: 10, w: 20, done: true, phase: 'warmup' },
          { r: 5, w: 60, done: true }
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
