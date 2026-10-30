import { describe, expect, it } from 'vitest'
import {
  evaluateSetMilestone,
  evaluateSessionProgression,
  sessionProgressionItems,
  resolvePolicy
} from './milestones.js'

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
          { r: 6, w: 60, done: true },
          { r: 5, w: 60, done: false }
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
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: false }
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

    it('returns an unlocked milestone on the final planned work set when all work sets hit target reps at working weight', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear', sets: 3 },
        sets: [
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: true },
          { r: 5, w: 60, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 2, { unit: 'kg', inc: 2.5 })
      expect(milestone).toEqual({
        kind: 'unlocked',
        label: 'All sets hit! +2.5 kg unlocked next session',
        inc: 2.5,
        unit: 'kg',
        reps: 5,
        targetReps: 5
      })
    })

    it('returns unlocked milestone with custom increment and active lb unit for linear progression', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 135, prog: 'linear', sets: 2, inc: 5 },
        sets: [
          { r: 5, w: 135, done: true },
          { r: 5, w: 135, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 1, { unit: 'lb' })
      expect(milestone).toEqual({
        kind: 'unlocked',
        label: 'All sets hit! +5 lb unlocked next session',
        inc: 5,
        unit: 'lb',
        reps: 5,
        targetReps: 5
      })
    })

    it('returns unlocked milestone for bodyweight exercise with 0 load under linear progression', () => {
      const entry = {
        id: 'push-up',
        target: { mode: 'reps', reps: 10, weight: 0, prog: 'linear', sets: 2 },
        sets: [
          { r: 10, w: 0, done: true },
          { r: 10, w: 0, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 1)
      expect(milestone).toEqual({
        kind: 'unlocked',
        label: 'All sets hit! Next target unlocked',
        reps: 10,
        targetReps: 10
      })
    })

    it('returns hit milestone on final work set if an earlier set missed target reps under linear progression', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear', sets: 3 },
        sets: [
          { r: 4, w: 60, done: true },
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

    it('returns hit milestone on final work set if an earlier set was below working weight', () => {
      const entry = {
        id: 'barbell-bench-press',
        target: { mode: 'reps', reps: 5, weight: 60, prog: 'linear', sets: 2 },
        sets: [
          { r: 5, w: 50, done: true },
          { r: 5, w: 60, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 1)
      expect(milestone).toEqual({
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
        kind: 'unlocked',
        label: 'All sets hit! +2.5 kg unlocked next session',
        inc: 2.5,
        unit: 'kg',
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

    it('evaluates timed hold with routine-inherited time progression', () => {
      const entry = {
        id: 'plank',
        target: { mode: 'time', sec: 60 },
        sets: [
          { sec: 60, done: true }
        ]
      }
      expect(evaluateSetMilestone(entry, 0, { routine: { prog: 'time' } })).toEqual({
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

    it('returns unlocked milestone for bodyweight exercise with 0 load under double progression', () => {
      const entry = {
        id: 'pull-up',
        target: { mode: 'reps', reps: 8, repsMin: 5, weight: 0, prog: 'double', sets: 2 },
        sets: [
          { r: 8, w: 0, done: true },
          { r: 8, w: 0, done: true }
        ]
      }
      const milestone = evaluateSetMilestone(entry, 1)
      expect(milestone).toEqual({
        kind: 'unlocked',
        label: 'All sets hit! Next target unlocked',
        reps: 8,
        targetReps: 8
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
          { r: 12, w: 12, done: true },
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

describe('evaluateSessionProgression and sessionProgressionItems', () => {
  const baseState = {
    unit: 'kg',
    workouts: [],
    routines: [
      {
        id: 'r-push',
        name: 'Push Day',
        ex: [
          { id: '0025', sets: 3, reps: 5, weight: 60, prog: 'linear' },
          { id: '0047', sets: 3, reps: 12, repsMin: 8, weight: 24, prog: 'double' },
        ]
      }
    ]
  }

  it('evaluates linear progression load increase with advance indicator and formatted delta', () => {
    const entry = {
      id: '0025',
      target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
      sets: [
        { w: 60, r: 5, done: true },
        { w: 60, r: 5, done: true },
        { w: 60, r: 5, done: true }
      ]
    }
    const item = evaluateSessionProgression(entry, baseState)
    expect(item).not.toBeNull()
    expect(item.id).toBe('0025')
    expect(item.policy).toBe('linear')
    expect(item.kind).toBe('up')
    expect(item.isAdvance).toBe(true)
    expect(item.iconName).toBe('arrowUp')
    expect(item.label).toBe('60 kg → 62.5 kg (+2.5 kg)')
    expect(item.text).toBe(item.label)
    expect(item.ariaLabel).toContain('60 kg → 62.5 kg (+2.5 kg)')
  })

  it('evaluates double progression rep climb aim without advancing weight', () => {
    const entry = {
      id: '0047',
      target: { sets: 3, reps: 12, repsMin: 8, weight: 24, prog: 'double' },
      sets: [
        { w: 24, r: 9, done: true },
        { w: 24, r: 9, done: true },
        { w: 24, r: 9, done: true }
      ]
    }
    const item = evaluateSessionProgression(entry, baseState)
    expect(item).not.toBeNull()
    expect(item.policy).toBe('double')
    expect(item.kind).toBe('hold')
    expect(item.isAdvance).toBe(false)
    expect(item.iconName).toBe('target')
    expect(item.label).toBe('Aim for 10 reps at 24 kg')
  })

  it('handles bodyweight rep climb without producing "0 kg → 0 kg"', () => {
    const entry = {
      id: 'push-up',
      target: { mode: 'reps', reps: 10, repsMax: 15, weight: 0, bodyweight: true, prog: 'linear', sets: 3 },
      sets: [
        { w: 0, r: 10, done: true },
        { w: 0, r: 10, done: true },
        { w: 0, r: 10, done: true }
      ]
    }
    const item = evaluateSessionProgression(entry, baseState)
    expect(item).not.toBeNull()
    expect(item.kind).toBe('up')
    expect(item.isAdvance).toBe(true)
    expect(item.iconName).toBe('arrowUp')
    expect(item.label).toBe('Aim for 11 reps')
    expect(item.label).not.toContain('0 kg → 0 kg')
    expect(item.label).not.toContain('0 kg')
  })

  it('handles bodyweight added sets without producing "0 kg → 0 kg"', () => {
    const entry = {
      id: 'push-up',
      target: { mode: 'reps', reps: 10, repsMax: 15, weight: 0, bodyweight: true, prog: 'linear', sets: 3 },
      sets: [
        { w: 0, r: 15, done: true },
        { w: 0, r: 15, done: true },
        { w: 0, r: 15, done: true }
      ]
    }
    const item = evaluateSessionProgression(entry, baseState)
    expect(item).not.toBeNull()
    expect(item.kind).toBe('up')
    expect(item.isAdvance).toBe(true)
    expect(item.iconName).toBe('arrowUp')
    expect(item.label).toBe('4 sets (+1 set)')
    expect(item.label).not.toContain('0 kg → 0 kg')
  })

  it('handles bodyweight hold without producing "Hold at 0 kg"', () => {
    const entry = {
      id: 'push-up',
      target: { mode: 'reps', reps: 10, repsMax: 15, weight: 0, bodyweight: true, prog: 'linear', sets: 3 },
      sets: [
        { w: 0, r: 8, done: true },
        { w: 0, r: 9, done: true },
        { w: 0, r: 9, done: true }
      ]
    }
    const item = evaluateSessionProgression(entry, baseState)
    expect(item).not.toBeNull()
    expect(item.kind).toBe('hold')
    expect(item.isAdvance).toBe(false)
    expect(item.label).toBe('Hold at 10 reps to solidify volume')
    expect(item.label).not.toContain('0 kg')
  })

  it('evaluates timed hold advance', () => {
    const entry = {
      id: 'plank',
      target: { mode: 'time', sec: 45, prog: 'time', sets: 2 },
      sets: [
        { sec: 45, done: true },
        { sec: 45, done: true }
      ]
    }
    const item = evaluateSessionProgression(entry, baseState)
    expect(item).not.toBeNull()
    expect(item.kind).toBe('up')
    expect(item.isAdvance).toBe(true)
    expect(item.label).toBe('45s → 50s (+5s)')
  })

  it('evaluates deload with constructive guidance and info icon', () => {
    const priorWorkouts = [
      {
        id: 'w-p1',
        d: '2026-10-20',
        entries: [{ id: '0025', target: { sets: 3, reps: 5, weight: 100, prog: 'linear' }, sets: [{ w: 100, r: 3, done: true }] }]
      },
      {
        id: 'w-p2',
        d: '2026-10-25',
        entries: [{ id: '0025', target: { sets: 3, reps: 5, weight: 100, prog: 'linear' }, sets: [{ w: 100, r: 3, done: true }] }]
      }
    ]
    const state = { ...baseState, workouts: priorWorkouts }
    const entry = {
      id: '0025',
      target: { sets: 3, reps: 5, weight: 100, prog: 'linear' },
      sets: [{ w: 100, r: 3, done: true }]
    }
    const item = evaluateSessionProgression(entry, state)
    expect(item).not.toBeNull()
    expect(item.kind).toBe('deload')
    expect(item.isAdvance).toBe(false)
    expect(item.iconName).toBe('info')
    expect(item.label).toBe('Deload 10% to reset and rebuild')
  })

  it('evaluates hold on missed linear target', () => {
    const entry = {
      id: '0025',
      target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
      sets: [{ w: 60, r: 4, done: true }]
    }
    const item = evaluateSessionProgression(entry, baseState)
    expect(item).not.toBeNull()
    expect(item.kind).toBe('hold')
    expect(item.isAdvance).toBe(false)
    expect(item.label).toBe('Hold at 60 kg to solidify volume')
  })

  it('returns null for entries with zero performed work sets', () => {
    const entry = {
      id: '0025',
      target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
      sets: [
        { w: 60, r: 5, done: false },
        { w: 60, r: 5, done: false }
      ]
    }
    expect(evaluateSessionProgression(entry, baseState)).toBeNull()
  })

  it('sessionProgressionItems maps all trained exercises in a completed workout', () => {
    const workout = {
      id: 'w-complete',
      routineId: 'r-push',
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
          sets: [
            { w: 60, r: 5, done: true },
            { w: 60, r: 5, done: true },
            { w: 60, r: 5, done: true }
          ]
        },
        {
          id: '0047',
          target: { sets: 3, reps: 12, repsMin: 8, weight: 24, prog: 'double' },
          sets: [
            { w: 24, r: 9, done: true },
            { w: 24, r: 9, done: true },
            { w: 24, r: 9, done: true }
          ]
        },
        {
          id: 'skipped-ex',
          target: { sets: 3, reps: 10, weight: 50 },
          sets: [
            { w: 50, r: 10, done: false }
          ]
        }
      ]
    }

    const items = sessionProgressionItems(workout, baseState)
    expect(items.length).toBe(2)
    expect(items[0].id).toBe('0025')
    expect(items[0].label).toBe('60 kg → 62.5 kg (+2.5 kg)')
    expect(items[1].id).toBe('0047')
    expect(items[1].label).toBe('Aim for 10 reps at 24 kg')
  })
})
