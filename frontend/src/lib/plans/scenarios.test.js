import { describe, it, expect } from 'vitest'
import { generateHistory, entriesOf } from './scenarios.js'
import { loadRecords } from '../training-log.js'
import { deleteWorkout } from '../history.js'
import { DELOAD_AFTER } from '../progression.js'


const kinds = entries => entries.map(e => e.plan?.kind)
const firstIndex = (entries, kind) => entries.findIndex(e => e.plan?.kind === kind)
const work = e => e.sets.filter(s => s.done)
const weakest = e => Math.min(...work(e).map(s => s.r))

describe('scenario 1: baseline, 8 clean weeks', () => {
  const S = generateHistory({ weeks: 8 })

  it('trains Mon, Tue, Thu, Fri and Sat only, with a weigh-in every day', () => {
    expect(S.workouts).toHaveLength(40)
    expect(S.bodyweight).toHaveLength(56)
    expect(new Set(S.workouts.map(w => new Date(`${w.d}T00:00:00Z`).getUTCDay()))).toEqual(new Set([1, 2, 4, 5, 6]))
  })

  it('adds 2.5 kg to the squat every clean session on linear progression', () => {
    const squat = entriesOf(S, 'Lower', '0043')
    expect(kinds(squat).slice(1).every(k => k === 'up')).toBe(true)
    expect(work(squat.at(-1))[0].w).toBe(77.5)
  })

  it('raises Thursday bench within the 8 weeks, with no deload', () => {
    const bench = entriesOf(S, 'Push', '0025')
    expect(kinds(bench)).toContain('up')
    expect(kinds(bench)).not.toContain('deload')
    expect(work(bench.at(-1))[0].w).toBeGreaterThan(work(bench[0])[0].w)
  })

  it('progresses Monday and Friday lateral raises on separate streams, with no deload', () => {
    ;['Upper', 'Pull'].forEach(day => {
      const raise = entriesOf(S, day, '0178')
      // The first finished Entry records the next Prescription the summary showed.
      expect(raise[0].plan.kind, day).toBe('up')
      expect(kinds(raise), day).toContain('up')
      expect(kinds(raise), day).not.toContain('deload')
      expect(work(raise.at(-1))[0].w, day).toBeGreaterThan(work(raise[0])[0].w)
      // Compare reps once the working weight is reached; the first session is the light baseline.
      expect(weakest(raise.at(-1)), day).toBeGreaterThan(weakest(raise[1]))
    })
  })

  it('reads Monday and Thursday bench as separate streams, so their weights can drift apart', () => {
    expect(entriesOf(S, 'Push', '0025')[0].plan.kind).toBe('hold')
  })
})

describe('scenario 1b: isolation total-reps target', () => {
  const S = generateHistory({ weeks: 6, lifter: { '0178': { w: 12.5, e1rm: 19 } }, day: () => ({ gain: { '0178': 0 } }) })
  const raise = entriesOf(S, 'Push', '0178')

  it('holds below the top of the range, then deloads a lifter the plan would step up', () => {
    expect(work(raise[0]).map(s => s.r)).toEqual([14, 13, 12, 11])
    expect(kinds(raise)).toEqual(['hold', 'hold', 'hold', 'hold', 'deload', 'up'])
  })
})

describe('scenario 2: illness', () => {
  const lifter = { '0194': { w: 27.5, e1rm: 34 } }
  const flat = { gain: { '0194': 0 } }
  const sick = ({ week, routine }) => (week === 2 && routine.name === 'Push' ? { ...flat, strength: 0.8 } : flat)
  const skipped = ({ week, routine }) => (week === 2 && routine.name === 'Push' ? null : flat)
  const ill = generateHistory({ weeks: 8, lifter, day: sick })
  const control = generateHistory({ weeks: 8, lifter, day: skipped })

  it('resumes at the dropped Increment the session after the sick one', () => {
    const push = ill.routines.find(r => r.name === 'Push').id
    const sessions = ill.workouts.filter(w => w.routineId === push)
    const sickDay = sessions.findIndex(w => w.d === '2026-09-24')
    const after = sessions[sickDay + 1]
    expect(sickDay).toBe(2)
    expect(after.d).toBe('2026-10-01')
    // The sick session records the Drop the summary showed; the next Target resumes at 22.5.
    expect(after.entries.find(e => e.id === '0194').plan).toMatchObject({ kind: 'hold', weight: 22.5 })
    expect(entriesOf(control, 'Push', '0194').some(e => e.plan?.weight === 22.5 && e.plan.kind === 'down')).toBe(false)
  })
})

describe('scenario 3: leg ramp', () => {
  const ramp = ({ week, routine }) => (week < 2 && ['Lower', 'Legs'].includes(routine.name) ? { dropSets: 1 } : {})
  const S = generateHistory({ weeks: 5, day: ramp })

  it('reads a skipped ramp set as missed reps before the squat advances', () => {
    expect(kinds(entriesOf(S, 'Lower', '0043')).slice(0, 4)).toEqual(['hold', 'hold', 'up', 'up'])
  })
})

describe('scenario 4: exam week', () => {
  const exam = ({ week, routine }) => (week === 4
    ? (['Upper', 'Lower'].includes(routine.name) ? { setsFactor: 1 / 3, strength: 0.95 } : null)
    : {})
  const S = generateHistory({ weeks: 7, day: exam })

  it('advances again the week after the reduced exam week', () => {
    const bench = entriesOf(S, 'Upper', '0025')
    expect(work(bench[4])).toHaveLength(1)
    expect(bench[5].plan).toMatchObject({ kind: 'up', weight: 72.5, reps: 5 })
    const squat = entriesOf(S, 'Lower', '0043')
    expect(squat[5].plan).toMatchObject({ kind: 'up', weight: 72.5 })
  })
})

describe('scenario 5: stall and deload', () => {
  const S = generateHistory({ weeks: 8, lifter: { '0194': { w: 27.5, e1rm: 34 } }, day: () => ({ gain: { '0194': 0 } }) })
  const ext = entriesOf(S, 'Push', '0194')

  it(`drops into the range, then deloads about 10% after ${DELOAD_AFTER.double} flat sessions on double progression`, () => {
    expect(ext[firstIndex(ext, 'down')].plan.weight).toBe(25)
    expect(firstIndex(ext, 'deload')).toBe(firstIndex(ext, 'down') + 1 + DELOAD_AFTER.double)
    expect(ext[firstIndex(ext, 'deload')].plan.weight).toBe(22.5)
  })
})

describe('scenario 6: load ceiling', () => {
  const S = generateHistory({ weeks: 8, day: () => ({ ceiling: { 'Heel-elevated dumbbell squat': 30 } }) })
  const squat = entriesOf(S, 'Legs', 'Heel-elevated dumbbell squat')

  it('keeps prescribing heavier dumbbells once the lifter is capped', () => {
    expect(squat.slice(3).every(e => e.plan.kind === 'up' && work(e)[0].w === 30)).toBe(true)
  })
})

describe('scenario 7: Records', () => {
  const S = generateHistory({ weeks: 3 })
  const lower = () => S.workouts.filter(w => w.name === 'Lower')
  const squatRecord = w => loadRecords(S, w).some(r => r.id === '0043')

  it('makes no Record on the first session, then one on each heavier squat', () => {
    expect(squatRecord(lower()[0])).toBe(false)
    expect(lower().slice(1).every(squatRecord)).toBe(true)
  })

  it('re-reads Records after a deletion: deleting the heaviest leaves the earlier one standing', () => {
    const [, second, third] = lower()
    deleteWorkout(S, third.id)
    expect(squatRecord(second)).toBe(true)
  })
})
