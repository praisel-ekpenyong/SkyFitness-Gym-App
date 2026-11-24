import { describe, expect, it } from 'vitest'
import { parseWorkoutCSV, parseBodyweight, mergeImport, importPreview } from './import-csv.js'
import { best, e1rmSeries, tonnage } from './training-log.js'
import { act } from './active-workout.js'
import { admit } from './profile/index.js'
import { normalizeWeight } from './units.js'

const CSV = [
  'Date,Exercise,Weight,Reps,Set Type',
  '2026-08-08,Bench Press,100,5,Warm-up',
  '2026-08-08,Bench Press,80,5,Working',
].join('\n')

describe('CSV warm-up provenance', () => {
  it('retains the imported warm-up phase and keeps it out of Tonnage', () => {
    const parsed = parseWorkoutCSV(CSV, { unit: 'kg' })
    const entry = parsed.workouts[0].entries[0]

    expect(parsed.warmups).toBe(1)
    expect(entry.sets).toEqual([
      { w: 100, r: 5, done: true, phase: 'warmup' },
      { w: 80, r: 5, done: true },
    ])
    expect(parsed.workouts[0].vol).toBeUndefined()
    expect(tonnage({ unit: 'kg' }, parsed.workouts[0])).toBe(400)
  })
})


describe('an imported Workout reads like the same Workout logged in Sky', () => {
  const sets = [{ w: 80, r: 5, done: true }, { w: 100, r: 3, done: true }, { w: 90, r: 5, done: true }]
  const csv = ['Date,Exercise,Weight,Reps', ...sets.map(s => `2026-08-08,Bench Press,${s.w},${s.r}`)].join('\n')

  const loggedInSky = () => {
    const S = {
      unit: 'kg', routines: [], workouts: [], bodyweight: [],
      active: { id: 'a1', d: '2026-08-08', start: 1000, routineId: null, name: 'Freestyle', bw: null, unit: 'kg', cur: 0, entries: [{ id: '0025', sets: sets.map(s => ({ ...s })) }] },
    }
    act(S, { type: 'finish' })
    return S
  }

  it('gives the same Best and remembers no top weight beside its Sets (ADR 0020)', () => {
    const imported = { unit: 'kg', workouts: [], customEx: [] }
    mergeImport(imported, parseWorkoutCSV(csv, { unit: 'kg' }))
    const logged = loggedInSky()

    expect(best(imported, '0025')).toBe(100)
    expect(best(imported, '0025')).toBe(best(logged, '0025'))
    expect(e1rmSeries(imported, '0025').map(p => p.y)).toEqual(e1rmSeries(logged, '0025').map(p => p.y))
    expect(imported.workouts[0].entries[0]).not.toHaveProperty('topW')
    expect(logged.workouts[0].entries[0]).not.toHaveProperty('topW')
  })

  it('leaves the top weight of a Workout imported earlier as it was stored', () => {
    const earlier = { id: 'iw-old', d: '2026-08-01', start: 1, entries: [{ id: '0025', topW: 100, sets: [{ w: 100, r: 5, done: true }] }] }
    const S = { unit: 'kg', workouts: [earlier], customEx: [] }
    mergeImport(S, parseWorkoutCSV(csv, { unit: 'kg' }))
    expect(S.workouts.find(w => w.id === 'iw-old').entries[0].topW).toBe(100)
  })
})


describe('CSV import enters through admit and the one Workout order', () => {
  it('round-trips imported Workouts through admit unchanged', () => {
    const parsed = parseWorkoutCSV([
      'Date,Exercise,Weight,Reps,Set Type,RPE',
      '2026-08-08,Bench Press,100,5,Warm-up,',
      '2026-08-08,Bench Press,80,5,Working,8',
      '2026-08-09,Squat (Barbell),120,3,Working,',
    ].join('\n'), { unit: 'kg' })
    expect(admit({ workouts: parsed.workouts }).workouts).toEqual(parsed.workouts)
  })

  it('merges imported Workouts in date, then start, then original-position order', () => {
    const S = { workouts: [{ id: 'existing', d: '2026-08-09', start: 1, entries: [] }], customEx: [] }
    const parsed = {
      kind: 'workouts',
      customEx: [],
      workouts: [
        { id: 'later', d: '2026-08-10', start: 1, entries: [{ id: '0025', sets: [{ w: 50, r: 5, done: true }] }] },
        { id: 'same-day-second', d: '2026-08-11', start: 9, entries: [{ id: '0025', sets: [{ w: 50, r: 5, done: true }] }] },
        { id: 'same-day-first', d: '2026-08-11', start: 2, entries: [{ id: '0025', sets: [{ w: 50, r: 5, done: true }] }] },
        { id: 'earlier', d: '2026-08-08', start: 1, entries: [{ id: '0025', sets: [{ w: 50, r: 5, done: true }] }] },
      ],
    }
    mergeImport(S, parsed)
    expect(S.workouts.map(w => w.id)).toEqual(['earlier', 'existing', 'later', 'same-day-first', 'same-day-second'])
  })
})


describe('mergeImport defensive guards', () => {
  it('handles missing workouts and entries without throwing', () => {
    const S1 = {}
    expect(() => mergeImport(S1, { kind: 'workouts', workouts: [{ d: '2026-08-08', entries: null }], customEx: [] })).not.toThrow()
    expect(S1.workouts).toBeDefined()
    const S2 = { workouts: null, customEx: null, bodyweight: [] }
    const parsed2 = { kind: 'workouts', workouts: [{ d: '2026-08-09', entries: [{ id: '0025', sets: [{ w: 60, r: 5, done: true }] }] }], customEx: [] }
    expect(() => mergeImport(S2, parsed2)).not.toThrow()
    expect(S2.workouts.length).toBe(1)
    const S3 = {}
    const parsed3 = { kind: 'workouts', workouts: [{ d: '2026-08-10' }], customEx: [] }
    expect(() => mergeImport(S3, parsed3)).not.toThrow()
  })

  it('handles completely absent S.workouts gracefully', () => {
    const S = { bodyweight: [] }
    const parsed = { kind: 'workouts', workouts: [{ d: '2026-08-11', entries: [{ id: '0025', sets: [{ w: 50, r: 5, done: true }] }] }], customEx: [] }
    expect(() => mergeImport(S, parsed)).not.toThrow()
    expect(S.workouts).toHaveLength(1)
    expect(S.workouts[0].entries).toHaveLength(1)
  })
})


describe('mergeImport writes no heaviest-weight cache or Records list', () => {
  it('adds Workouts without stamping prs or touching exWeights', () => {
    const cache = { '0025': { w: 20, d: '2026-01-01', unit: 'kg' } }
    const S = { workouts: [], customEx: [], exWeights: cache }
    const parsed = { kind: 'workouts', workouts: [{ id: 'iw1', d: '2026-08-11', entries: [{ id: '0025', sets: [{ w: 50, r: 5, done: true }] }] }], customEx: [] }
    expect(mergeImport(S, parsed)).toEqual({ added: 1, skipped: 0 })
    expect(S.exWeights).toEqual({ '0025': { w: 20, d: '2026-01-01', unit: 'kg' } })
    const fresh = {}
    mergeImport(fresh, parsed)
    expect('exWeights' in fresh).toBe(false)
    const csv = parseWorkoutCSV('Date,Exercise,Weight,Reps\n2026-08-08,Bench Press,80,5', { unit: 'kg' })
    expect('prs' in csv.workouts[0]).toBe(false)
  })
})


describe('import custom-exercise body-part fallback', () => {
  const byName = parsed => Object.fromEntries(parsed.customEx.map(c => [c.n, c]))

  it('maps known categories onto body parts, case-insensitively', () => {
    const csv = [
      'Date,Exercise,Category,Weight,Reps',
      '2026-08-08,Zzx Qqq Alpha Lift,Chest,80,5',
      '2026-08-08,Zzx Qqq Beta Lift,SHOULDERS,40,8',
      '2026-08-08,Zzx Qqq Gamma Lift,Biceps,30,10',
    ].join('\n')
    const customs = byName(parseWorkoutCSV(csv, { unit: 'kg' }))
    expect(customs['zzx qqq alpha lift'].bp).toBe('chest')
    expect(customs['zzx qqq beta lift'].bp).toBe('shoulders')
    expect(customs['zzx qqq gamma lift'].bp).toBe('upper arms')
  })

  it("falls back to 'upper legs' for an unknown category on a strength row", () => {
    const csv = [
      'Date,Exercise,Category,Weight,Reps',
      '2026-08-08,Zzx Qqq Mystery Lift,Mystery,80,5',
    ].join('\n')
    const customs = byName(parseWorkoutCSV(csv, { unit: 'kg' }))
    const rec = customs['zzx qqq mystery lift']
    expect(rec.bp).toBe('upper legs')
    expect(rec.n).toBe('zzx qqq mystery lift')
    expect(rec.tg).toBe('')
    expect(rec.sm).toBeUndefined()
  })

  it("falls back to 'cardio' when the row carries distance", () => {
    const csv = [
      'Date,Exercise,Category,Distance',
      '2026-08-08,Zzx Qqq Cardio Thing,Mystery,5',
    ].join('\n')
    const customs = byName(parseWorkoutCSV(csv, { unit: 'kg' }))
    expect(customs['zzx qqq cardio thing'].bp).toBe('cardio')
  })

  it("falls back to 'cardio' for time without reps", () => {
    const csv = [
      'Date,Exercise,Category,Time',
      '2026-08-08,Zzx Qqq Row Thing,Mystery,30:00',
    ].join('\n')
    const customs = byName(parseWorkoutCSV(csv, { unit: 'kg' }))
    expect(customs['zzx qqq row thing'].bp).toBe('cardio')
  })
})


describe('mergeImport bodyweight skip rule', () => {
  it('leaves existing days alone and reports added/skipped', () => {
    const S = { bodyweight: [{ d: '2026-01-01', w: 80, t: 1 }] }
    const res = mergeImport(S, {
      kind: 'bodyweight',
      bodyweight: [{ d: '2026-01-01', w: 81, t: 2 }, { d: '2026-01-02', w: 79, t: 3 }],
    })
    expect(res).toEqual({ added: 1, skipped: 1 })
    expect(S.bodyweight).toEqual([
      { d: '2026-01-01', w: 80, t: 1 },
      { d: '2026-01-02', w: 79, t: 3 },
    ])
  })

  it('normalizes a missing bodyweight log instead of throwing', () => {
    const S = {}
    const res = mergeImport(S, { kind: 'bodyweight', bodyweight: [{ d: '2026-01-02', w: 79 }] })
    expect(res).toEqual({ added: 1, skipped: 0 })
    expect(S.bodyweight).toHaveLength(1)
  })
})


describe('importPreview — the totalling dry-run', () => {
  const workoutParsed = () => parseWorkoutCSV(CSV, { unit: 'kg' })

  it('reports exactly what mergeImport will return, without writing (workouts)', () => {
    const S0 = { workouts: [], customEx: [] }
    const preview = importPreview(S0, workoutParsed())
    expect(S0.workouts).toEqual([])

    const S1 = { workouts: [], customEx: [] }
    const merged = mergeImport(S1, workoutParsed())
    expect(preview).toEqual(merged)
  })

  it('counts already-logged days as skipped when re-importing the same file', () => {
    const S = { workouts: [{ d: '2026-08-08', entries: [] }] }
    expect(importPreview(S, workoutParsed())).toEqual({ added: 0, skipped: 1 })
  })

  it('delegates the bodyweight branch and matches mergeImport there too', () => {
    const S0 = { bodyweight: [{ d: '2026-01-01', w: 80 }] }
    const parsed = { kind: 'bodyweight', bodyweight: [{ d: '2026-01-01', w: 81 }, { d: '2026-01-02', w: 79 }] }
    expect(importPreview(S0, parsed)).toEqual({ added: 1, skipped: 1 })
    expect(S0.bodyweight).toHaveLength(1)

    const S1 = { bodyweight: [{ d: '2026-01-01', w: 80 }] }
    expect(mergeImport(S1, parsed)).toEqual({ added: 1, skipped: 1 })
  })
})

describe('exercise notes CSV import mapping', () => {
  it('maps Hevy exercise_notes to entry.notes, trimming and capping at 500 chars', () => {
    const longNote = 'B'.repeat(600)
    const csv = [
      'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
      `"Leg Day","2026-09-01 10:00:00","2026-09-01 11:00:00","","Bench Press","", " Seat 5, pin 3 ",0,"normal",80,5,,,`,
      `"Leg Day","2026-09-01 10:00:00","2026-09-01 11:00:00","","Bench Press","","",1,"normal",80,5,,,`,
      `"Leg Day","2026-09-01 10:00:00","2026-09-01 11:00:00","","Squat (Barbell)","","${longNote}",0,"normal",100,5,,,`,
      `"Leg Day","2026-09-01 10:00:00","2026-09-01 11:00:00","","Deadlift (Barbell)","","   ",0,"normal",120,5,,,`,
    ].join('\n')

    const res = parseWorkoutCSV(csv, { unit: 'kg' })
    expect(res.workouts).toHaveLength(1)
    const entries = res.workouts[0].entries
    expect(entries).toHaveLength(3)

    expect(entries[0].notes).toBe('Seat 5, pin 3')

    expect(entries[1].notes).toBe('B'.repeat(500))

    expect(entries[2].notes).toBeUndefined()
  })

  it('maps FitNotes/Strong Comment or Notes column to entry.notes', () => {
    const csv = [
      'Date,Exercise,Weight,Reps,Comment',
      '2026-09-02,Bench Press,80,5,"Right shoulder tight"',
    ].join('\n')

    const res = parseWorkoutCSV(csv, { unit: 'kg' })
    expect(res.workouts[0].entries[0].notes).toBe('Right shoulder tight')
  })
})

describe('date-only Apple Health weigh-in and CSV workout alignment', () => {
  it('an imported Apple Health weigh-in and a CSV workout dated the same day produce timestamps on the same local day and have matching dates', () => {
    const ahCsv = [
      'Date,Weight',
      '2026-03-10,75.5',
    ].join('\n')
    const workoutCsv = [
      'Date,Exercise,Weight,Reps',
      '2026-03-10,Bench Press,100,5',
    ].join('\n')

    const parsedBw = parseBodyweight(ahCsv, { unit: 'kg' })
    const parsedWorkouts = parseWorkoutCSV(workoutCsv, { unit: 'kg' })

    const weighIn = parsedBw.bodyweight[0]
    const workout = parsedWorkouts.workouts[0]

    const bwDate = new Date(weighIn.t)
    const workoutDate = new Date(workout.start)

    expect(weighIn.d).toBe(workout.d)
    expect(bwDate.getFullYear()).toBe(workoutDate.getFullYear())
    expect(bwDate.getMonth()).toBe(workoutDate.getMonth())
    expect(bwDate.getDate()).toBe(workoutDate.getDate())
    expect(weighIn.t).toBe(workout.start)
    expect(workout.start).toBe(new Date('2026-03-10T12:00:00').getTime())
  })

  it('timed CSV workouts compute timestamps from midnight without rolling over', () => {
    const workoutCsv = [
      'Date,Exercise,Weight,Reps',
      '2026-03-10 10:00,Bench Press,100,5',
    ].join('\n')
    const parsed = parseWorkoutCSV(workoutCsv, { unit: 'kg' })
    const workout = parsed.workouts[0]
    const workoutDate = new Date(workout.start)
    expect(workoutDate.getFullYear()).toBe(2026)
    expect(workoutDate.getMonth()).toBe(2)
    expect(workoutDate.getDate()).toBe(10)
    expect(workoutDate.getHours()).toBe(10)
    expect(workoutDate.getMinutes()).toBe(0)
  })

  it('timed bodyweight CSV computes timestamp from midnight', () => {
    const ahCsv = [
      'Date,Weight',
      '2026-03-10 08:30,75.5',
    ].join('\n')
    const parsed = parseBodyweight(ahCsv, { unit: 'kg' })
    const bw = parsed.bodyweight[0]
    const bwDate = new Date(bw.t)
    expect(bwDate.getHours()).toBe(8)
    expect(bwDate.getMinutes()).toBe(30)
  })
})



describe('lb weigh-in import converts like normalizeWeight', () => {
  it('imports a lb Apple Health weigh-in to the kg value normalizeWeight returns', () => {
    const xml = '<Record type="HKQuantityTypeIdentifierBodyMass" unit="lb" startDate="2026-01-05 08:00:00 +0000" value="176.4"/>'
    const res = parseBodyweight(xml, { unit: 'kg' })
    expect(res.bodyweight[0].w).toBe(normalizeWeight(176.4, 'lb', 'kg'))
    expect(res.bodyweight[0].w).toBe(80)
  })

  it('imports a lb workout CSV into kg through the same path', () => {
    const csv = 'Date,Exercise,Weight,Weight Unit,Reps\n2026-08-08,Bench Press,176.4,lb,5'
    const res = parseWorkoutCSV(csv, { unit: 'kg' })
    const set = res.workouts[0].entries[0].sets[0]
    expect(set.w).toBe(normalizeWeight(176.4, 'lb', 'kg'))
    expect(set.w).toBe(80)
  })
})
