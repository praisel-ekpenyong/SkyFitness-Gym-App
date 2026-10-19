import { describe, it, expect } from 'vitest'
import { modeFor, topSetSeries, currentBest, weeksSinceTraining, lastWorkSetAt } from './exercise-progress.js'
import { EXDB } from './exercises.js'

// Real ids out of the shipped catalogue, so the catalogue fallback is exercised for real.
const CARDIO = EXDB.find(e => e.bp === 'cardio').id
// A *loaded* lift: the catalogue's first non-cardio entry is a sit-up, which since issue #32
// defaults to bodyweight and would quietly send every label test down the other path.
const LIFT = EXDB.find(e => e.bp !== 'cardio' && e.eq !== 'body weight').id

const w = (d, entries) => ({ d, entries })

describe('modeFor', () => {
  it('reads the logged mode off the latest entry, not the catalogue', () => {
    const S = {
      workouts: [
        w('2026-01-01', [{ id: LIFT, target: { mode: 'time' }, sets: [{ sec: 60, w: 10, done: true }] }]),
      ],
    }
    expect(modeFor(S, LIFT)).toBe('time')
  })

  it('falls back to the catalogue when the exercise was never logged', () => {
    expect(modeFor({ workouts: [] }, CARDIO)).toBe('cardio')
    expect(modeFor({ workouts: [] }, LIFT)).toBe('reps')
    expect(modeFor({ workouts: [] }, 'no-such-exercise')).toBe('reps')
  })

  it('reads a missing exercise as reps rather than crashing the chart', () => {
    expect(modeFor({ workouts: [] }, null)).toBe('reps')
    expect(modeFor({}, LIFT)).toBe('reps')
  })
})

describe('topSetSeries', () => {
  it('yields one chronological point per workout that produced a top set', () => {
    const S = {
      unit: 'kg',
      workouts: [
        w('2026-01-01', [{ id: LIFT, sets: [{ w: 80, r: 5, done: true }] }]),
        w('2026-01-08', [{ id: LIFT, sets: [{ w: 90, r: 5, done: true }, { w: 95, r: 3, done: false }] }]),
        w('2026-01-15', [{ id: LIFT, sets: [{ w: 85, r: 5, done: true }] }]),
      ],
    }
    const pts = topSetSeries(S, LIFT)
    expect(pts.map(p => p.d)).toEqual(['2026-01-01', '2026-01-08', '2026-01-15'])
    expect(pts.map(p => p.y)).toEqual([80, 90, 85])
  })

  it('carries the scored sets and the target each point was logged against', () => {
    const target = { mode: 'reps', sets: 2, reps: 5, weight: 80 }
    const S = {
      unit: 'kg',
      workouts: [w('2026-01-01', [{ id: LIFT, target, sets: [{ w: 80, r: 5, done: true }] }])],
    }
    const [pt] = topSetSeries(S, LIFT)
    expect(pt.sets).toEqual([{ w: 80, r: 5, done: true }])
    expect(pt.target).toEqual(target)
    expect(pt.t).toBeGreaterThan(0)
  })

  it('ignores unticked sets and warm-up rows, which never score', () => {
    const S = {
      unit: 'kg',
      workouts: [w('2026-01-01', [{ id: LIFT, sets: [
        { w: 120, r: 5, done: true, warmup: true },
        { w: 200, r: 5, done: false },
        { w: 80, r: 5, done: true },
      ] }])],
    }
    expect(topSetSeries(S, LIFT).map(p => p.y)).toEqual([80])
  })

  it('skips sessions logged in another mode — a hold is not a lighter top set', () => {
    const S = {
      unit: 'kg',
      workouts: [
        w('2026-01-01', [{ id: LIFT, target: { mode: 'time' }, sets: [{ sec: 90, w: 20, done: true }] }]),
        w('2026-01-08', [{ id: LIFT, sets: [{ w: 80, r: 5, done: true }] }]),
      ],
    }
    // the latest entry is reps, so the exercise resolves to reps and the timed
    // session drops out of the series instead of reading as a lighter top set
    expect(modeFor(S, LIFT)).toBe('reps')
    expect(topSetSeries(S, LIFT).map(p => p.d)).toEqual(['2026-01-08'])
  })

  it('prefers completed reps rows when an entry genuinely mixes modes', () => {
    const S = {
      unit: 'kg',
      workouts: [w('2026-01-01', [{ id: LIFT, sets: [
        { w: 80, r: 5, done: true },
        { sec: 90, done: true },
      ] }])],
    }
    // no target pins the rows, so reps wins by precedence and the hold
    // scores nothing into the series
    expect(modeFor(S, LIFT)).toBe('reps')
    expect(topSetSeries(S, LIFT).map(p => p.y)).toEqual([80])
  })

  it('scores timed holds by longest hold and cardio by top speed', () => {
    const timed = {
      unit: 'kg',
      workouts: [w('2026-01-01', [{ id: LIFT, target: { mode: 'time' }, sets: [
        { sec: 60, w: 10, done: true }, { sec: 90, w: 10, done: true },
      ] }])],
    }
    expect(topSetSeries(timed, LIFT).map(p => p.y)).toEqual([90])

    const cardio = {
      unit: 'kg',
      workouts: [w('2026-01-01', [{ id: CARDIO, sets: [
        { min: 20, speed: 8, done: true }, { min: 20, speed: 9.5, done: true },
      ] }])],
    }
    expect(topSetSeries(cardio, CARDIO).map(p => p.y)).toEqual([9.5])
  })

  it('has nothing to say about an exercise that was never scored', () => {
    expect(topSetSeries({ workouts: [] }, LIFT)).toEqual([])
    expect(topSetSeries({ workouts: [w('2026-01-01', [{ id: LIFT, sets: [{ w: 80, r: 5, done: false }] }])] }, LIFT)).toEqual([])
  })
})

describe('currentBest', () => {
  it('reads the latest session that produced a best, with its unit', () => {
    const S = {
      unit: 'kg',
      workouts: [
        w('2026-01-01', [{ id: LIFT, sets: [{ w: 80, r: 5, done: true }] }]),
        w('2026-01-08', [{ id: LIFT, sets: [{ w: 90, r: 5, done: true }] }]),
      ],
    }
    expect(currentBest(S, LIFT)).toEqual({ mx: 90, unit: 'kg' })
  })

  it('skips a latest session that scored nothing and reads the one before', () => {
    const S = {
      unit: 'kg',
      workouts: [
        w('2026-01-01', [{ id: LIFT, sets: [{ w: 80, r: 5, done: true }] }]),
        w('2026-01-08', [{ id: LIFT, sets: [{ w: 90, r: 5, done: false }] }]),
      ],
    }
    expect(currentBest(S, LIFT)).toEqual({ mx: 80, unit: 'kg' })
  })

  it('falls back to the catalogue mode when an entry mixes modes with nothing scored', () => {
    const S = {
      unit: 'kg',
      workouts: [w('2026-01-01', [{ id: LIFT, sets: [
        { w: 80, r: 5, done: false },
        { sec: 90, done: false },
      ] }])],
    }
    // metricModeForEntry is null (mixed, nothing completed), so currentBest
    // resolves via the catalogue fallback and finds nothing scored
    expect(currentBest(S, LIFT)).toEqual({ mx: 0, unit: 'kg' })
  })

  it('reports timed and cardio bests in their own units, not the profile unit', () => {
    const timed = {
      unit: 'kg',
      workouts: [w('2026-01-01', [{ id: LIFT, target: { mode: 'time' }, sets: [{ sec: 90, w: 10, done: true }] }])],
    }
    expect(currentBest(timed, LIFT)).toEqual({ mx: 90, unit: 's' })

    const cardio = {
      unit: 'kg',
      workouts: [w('2026-01-01', [{ id: CARDIO, sets: [{ min: 20, speed: 9.5, done: true }] }])],
    }
    expect(currentBest(cardio, CARDIO)).toEqual({ mx: 9.5, unit: 'km/h' })
  })

  it('reads an unscored exercise as zero in the profile unit', () => {
    expect(currentBest({ unit: 'kg', workouts: [] }, LIFT)).toEqual({ mx: 0, unit: 'kg' })
  })
})

describe('weeksSinceTraining', () => {
  const DAY = 86400000
  it('counts whole weeks, with under a week reading as zero', () => {
    expect(weeksSinceTraining(100 * DAY, 100 * DAY)).toBe(0)
    expect(weeksSinceTraining(100 * DAY, 94 * DAY)).toBe(0)
    expect(weeksSinceTraining(100 * DAY, 93 * DAY)).toBe(1)
    expect(weeksSinceTraining(100 * DAY, 86 * DAY)).toBe(2)
  })

  it('never goes negative for a timestamp in the future', () => {
    expect(weeksSinceTraining(100 * DAY, 101 * DAY)).toBe(0)
  })
})

describe('lastWorkSetAt', () => {
  const at = d => Date.parse(d + 'T12:00:00Z')
  const wk = (d, entries) => ({ d, start: at(d), entries })

  it('reads the latest timestamp with a performed work set, ignoring warm-ups and undone rows', () => {
    const workouts = [
      wk('2026-01-01', [{ id: LIFT, sets: [{ w: 80, r: 5, done: true }] }]),
      wk('2026-01-08', [{ id: LIFT, sets: [{ w: 40, r: 5, phase: 'warmup', done: true }] }]),
      wk('2026-01-15', [{ id: LIFT, sets: [{ w: 85, r: 5, done: false }] }]),
    ]
    expect(lastWorkSetAt(workouts, LIFT)).toBe(at('2026-01-01'))
  })

  it('returns null when the exercise was never trained', () => {
    expect(lastWorkSetAt([], LIFT)).toBeNull()
    expect(lastWorkSetAt(undefined, LIFT)).toBeNull()
    const workouts = [wk('2026-01-01', [{ id: LIFT, sets: [{ w: 80, r: 5, done: false }] }])]
    expect(lastWorkSetAt(workouts, LIFT)).toBeNull()
  })

  it('ignores a later workout that does not include the exercise', () => {
    const workouts = [
      wk('2026-01-01', [{ id: LIFT, sets: [{ w: 80, r: 5, done: true }] }]),
      wk('2026-01-20', [{ id: CARDIO, sets: [{ sec: 60, done: true }] }]),
    ]
    expect(lastWorkSetAt(workouts, LIFT)).toBe(at('2026-01-01'))
  })

  it('counts a workout when a duplicate entry carries the performed work set', () => {
    const workouts = [
      wk('2026-01-01', [
        { id: LIFT, sets: [{ w: 80, r: 5, done: false }] },
        { id: LIFT, sets: [{ w: 80, r: 5, done: true }] },
      ]),
    ]
    expect(lastWorkSetAt(workouts, LIFT)).toBe(at('2026-01-01'))
  })
})
