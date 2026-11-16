import { describe, it, expect } from 'vitest'
import { generateHistory, entriesOf } from './scenarios.js'
import { loadRecords } from '../training-log.js'
import { deleteWorkout } from '../history.js'
import { DELOAD_AFTER } from '../progression.js'

/*
 * Seven named scenarios on the 5-day hypertrophy plan, generated from a made-up lifter.
 * `it` pins what the engine does today. `it.fails` states what the plan asks for and the
 * engine cannot do yet; each names its ticket in .scratch/hypertrophy-plan/issues/. When a
 * ticket lands, its `it.fails` starts failing: turn it into a plain `it`.
 */

const kinds = entries => entries.map(e => e.plan?.kind)
const firstIndex = (entries, kind) => entries.findIndex(e => e.plan?.kind === kind)
const work = e => e.sets.filter(s => s.done)
const dateOfFirst = (S, routine, ex, kind) => {
  const routineId = S.routines.find(r => r.name === routine).id
  const id = S.customEx.find(c => c.n === ex)?.id || ex
  return S.workouts.find(w => w.routineId === routineId && w.entries.some(e => e.id === id && e.plan?.kind === kind))?.d
}
/** Pairs (previous session, next session) where the previous one met `rule`. */
const after = (entries, rule) => entries.slice(1).filter((_, i) => rule(entries[i]))

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

  it('reads Monday and Friday lateral raises as one stream, so it deloads after two Mondays', () => {
    // Both are 3 × 10–15: same Target shape, so Friday's sessions count toward Monday's Run.
    expect(firstIndex(entriesOf(S, 'Upper', '0178'), 'deload')).toBe(3)
  })

  // Ticket 02: compound first-set rule.
  it.fails('raises Thursday bench once set 1 reaches 8 and later sets stay in 6–8', () => {
    const bench = entriesOf(S, 'Push', '0025')
    const ready = after(bench, e => work(e)[0].r >= 8 && work(e).every(s => s.r >= 6))
    expect(ready.length).toBeGreaterThan(0)
    ready.forEach(next => expect(next.plan.kind).toBe('up'))
  })

  // Ticket 05: one working weight for a lift trained on two days.
  it.fails('keeps Monday and Thursday bench at one working weight', () => {
    expect(work(entriesOf(S, 'Upper', '0025').at(-1))[0].w).toBe(work(entriesOf(S, 'Push', '0025').at(-1))[0].w)
  })
})

describe('scenario 1b: isolation total-reps target', () => {
  // A flat lifter doing 14, 13, 12, 11 on Thursday's 4 × 10–15 lateral raise: 50 reps, none under 10.
  const S = generateHistory({ weeks: 6, lifter: { '0178': { w: 12.5, e1rm: 19 } }, day: () => ({ gain: { '0178': 0 } }) })
  const raise = entriesOf(S, 'Push', '0178')

  it('holds below the top of the range, then deloads a lifter the plan would step up', () => {
    expect(work(raise[0]).map(s => s.r)).toEqual([14, 13, 12, 11])
    expect(kinds(raise)).toEqual(['first', 'hold', 'hold', 'hold', 'hold', 'deload'])
  })

  // Ticket 03: isolation total-reps rule.
  it.fails('steps up once total reps reach 50 with no set under 10', () => {
    expect(raise[1].plan.kind).toBe('up')
  })
})

describe('scenario 2: illness', () => {
  // A lifter close to a stall on Thursday overhead extensions; week 2 Thursday is a sick session.
  const lifter = { '0194': { w: 27.5, e1rm: 34 } }
  const flat = { gain: { '0194': 0 } }
  const sick = ({ week, routine }) => (week === 2 && routine.name === 'Push' ? { ...flat, strength: 0.8 } : flat)
  const skipped = ({ week, routine }) => (week === 2 && routine.name === 'Push' ? null : flat)
  const ill = generateHistory({ weeks: 8, lifter, day: sick })
  const control = generateHistory({ weeks: 8, lifter, day: skipped })

  it('counts the sick session as a stall today, so the deload comes a week early', () => {
    expect(dateOfFirst(ill, 'Push', '0194', 'deload')).toBe('2026-10-15')
    expect(dateOfFirst(control, 'Push', '0194', 'deload')).toBe('2026-10-22')
  })

  // Ticket 07: sessions that do not count toward progression.
  it.fails('deloads on the same day whether the sick session was logged or skipped', () => {
    expect(dateOfFirst(ill, 'Push', '0194', 'deload')).toBe(dateOfFirst(control, 'Push', '0194', 'deload'))
  })
})

describe('scenario 3: leg ramp', () => {
  // Weeks 0–1: one fewer set on every leg exercise (min 2), by skipping it rather than editing the Routine.
  const ramp = ({ week, routine }) => (week < 2 && ['Lower', 'Legs'].includes(routine.name) ? { dropSets: 1 } : {})
  const S = generateHistory({ weeks: 5, day: ramp })

  it('reads a skipped ramp set as missed reps, so the squat holds through the ramp', () => {
    expect(kinds(entriesOf(S, 'Lower', '0043')).slice(0, 4)).toEqual(['first', 'hold', 'hold', 'up'])
  })

  // Ticket 08: planned phases (ramp, exam week).
  it.fails('adds load every ramp session when each performed set hits its reps', () => {
    expect(kinds(entriesOf(S, 'Lower', '0043')).slice(1, 3)).toEqual(['up', 'up'])
  })
})

describe('scenario 4: exam week', () => {
  // Week 4: Upper and Lower only, a third of the sets, a little weaker; the rest of the week off.
  const exam = ({ week, routine }) => (week === 4
    ? (['Upper', 'Lower'].includes(routine.name) ? { setsFactor: 1 / 3, strength: 0.95 } : null)
    : {})
  const S = generateHistory({ weeks: 7, day: exam })

  it('resumes at the last working weights the week after', () => {
    const bench = entriesOf(S, 'Upper', '0025')
    expect(work(bench[4])).toHaveLength(1)
    expect(bench[5].plan).toMatchObject({ kind: 'hold', weight: 70 })
    const squat = entriesOf(S, 'Lower', '0043')
    expect(squat[5].plan).toMatchObject({ kind: 'hold', weight: 70 })
  })
})

describe('scenario 5: stall and deload', () => {
  const S = generateHistory({ weeks: 8, lifter: { '0194': { w: 27.5, e1rm: 34 } }, day: () => ({ gain: { '0194': 0 } }) })
  const ext = entriesOf(S, 'Push', '0194')

  it(`deloads about 10% after ${DELOAD_AFTER.double} flat sessions on double progression`, () => {
    expect(firstIndex(ext, 'deload')).toBe(1 + DELOAD_AFTER.double)
    expect(ext[firstIndex(ext, 'deload')].plan.weight).toBe(25)
  })

  // Ticket 04: deload after 3 stalls, as the plan says.
  it.fails('deloads after 3 flat sessions, as the plan says', () => {
    expect(firstIndex(ext, 'deload')).toBe(4)
  })
})

describe('scenario 6: load ceiling', () => {
  // The heel-elevated squat tops out at 30 kg dumbbells.
  const S = generateHistory({ weeks: 8, day: () => ({ ceiling: { 'Heel-elevated dumbbell squat': 30 } }) })
  const squat = entriesOf(S, 'Legs', 'Heel-elevated dumbbell squat')

  it('keeps prescribing heavier dumbbells once the lifter is capped', () => {
    expect(squat.slice(3).every(e => e.plan.kind === 'up' && work(e)[0].w === 30)).toBe(true)
  })

  // Ticket 06: a per-exercise load ceiling.
  it.fails('never prescribes past the heaviest dumbbells there are', () => {
    squat.forEach(e => expect(e.plan.weight ?? 0).toBeLessThanOrEqual(30))
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
