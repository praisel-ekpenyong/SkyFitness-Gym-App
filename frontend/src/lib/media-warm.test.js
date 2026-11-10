import { describe, expect, it } from 'vitest'
import { exercisesToWarm } from './media-warm.js'

// A workout started in a gym with no signal still needs its pictures, so the art for the session in
// progress and the next scheduled sessions is fetched ahead of time, while the phone is online.
const base = {
  routines: [
    { id: 'push', name: 'Push', ex: [{ id: '0025' }, { id: '0047' }] },
    { id: 'legs', name: 'Legs', ex: [{ id: '0043' }, { id: '0025' }] },
    { id: 'pull', name: 'Pull', ex: [{ id: '0027' }] },
  ],
  week: { 1: 'push', 3: 'legs' },   // Monday, Wednesday
  dayPlan: {},
  active: null,
  workouts: [],
}

describe('exercisesToWarm', () => {
  it('takes the exercises of the coming week, soonest first, each once', () => {
    // 2026-11-09 is a Monday
    expect(exercisesToWarm(base, '2026-11-09')).toEqual(['0025', '0047', '0043'])
  })

  it('puts the workout in progress first', () => {
    const S = { ...base, active: { entries: [{ id: '0027' }, { id: '0025' }] } }
    expect(exercisesToWarm(S, '2026-11-09')).toEqual(['0027', '0025', '0047', '0043'])
  })

  it('stops at the cap, so one long plan cannot fill the art cache', () => {
    const many = { ...base, routines: [{ id: 'big', ex: Array.from({ length: 40 }, (_, i) => ({ id: String(i).padStart(4, '0') })) }], week: { 1: 'big' } }
    expect(exercisesToWarm(many, '2026-11-09', 12)).toHaveLength(12)
  })

  it('warms nothing for a profile with no plan and no workout', () => {
    expect(exercisesToWarm({ routines: [], week: {}, dayPlan: {}, active: null, workouts: [] }, '2026-11-09')).toEqual([])
  })
})
