import { describe, it, expect } from 'vitest'
import { workoutSummary, summarizeWorkouts } from './workout-summary.js'

const S = { unit: 'kg', workouts: [] }
const set = (w, r, extra = {}) => ({ w, r, done: true, ...extra })
const warmup = (w, r) => set(w, r, { phase: 'warmup' })
const workout = ({ entries, ...times }) => ({ id: 'w', d: '2026-11-16', start: 0, end: 60 * 60000, ...times, entries })

describe('workoutSummary', () => {
  it('counts Work sets and warm-ups apart, and leaves warm-ups out of Tonnage', () => {
    const w = workout({ entries: [{ id: 'bench', sets: [warmup(20, 10), warmup(40, 5), set(95, 8), set(95, 8)] }] })
    expect(workoutSummary(S, w)).toEqual({ workSets: 2, warmups: 2, durationMs: 60 * 60000, tonnage: 95 * 8 * 2 })
  })

  it('never counts an unperformed set', () => {
    const w = workout({ entries: [{ id: 'bench', sets: [set(95, 8), set(95, 8, { done: false }), set(20, 10, { phase: 'warmup', done: false })] }] })
    const sum = workoutSummary(S, w)
    expect(sum.workSets).toBe(1)
    expect(sum.warmups).toBe(0)
  })

  it.each([
    ['missing', undefined],
    ['not a number', 'later'],
    ['before the start', -5],
    ['equal to the start', 0],
  ])('reads the duration as unknown when the end is %s', (_, end) => {
    expect(workoutSummary(S, workout({ start: 0, end, entries: [] })).durationMs).toBeNull()
  })

  it('reads an empty or malformed Workout as nothing', () => {
    expect(workoutSummary(S, { entries: null })).toEqual({ workSets: 0, warmups: 0, durationMs: null, tonnage: 0 })
  })
})

describe('summarizeWorkouts', () => {
  it('adds up Work sets, Tonnage and known durations, skipping unknown ones', () => {
    const a = workout({ start: 0, end: 30 * 60000, entries: [{ id: 'squat', sets: [warmup(60, 5), set(100, 5)] }] })
    const b = workout({ start: 0, end: undefined, entries: [{ id: 'squat', sets: [set(100, 5), set(100, 5)] }] })
    expect(summarizeWorkouts(S, [a, b])).toEqual({ workouts: 2, workSets: 3, durationMs: 30 * 60000, tonnage: 1500 })
  })

  it('reads no Workouts as zero everywhere', () => {
    expect(summarizeWorkouts(S, [])).toEqual({ workouts: 0, workSets: 0, durationMs: 0, tonnage: 0 })
    expect(summarizeWorkouts(S, undefined)).toEqual({ workouts: 0, workSets: 0, durationMs: 0, tonnage: 0 })
  })
})
