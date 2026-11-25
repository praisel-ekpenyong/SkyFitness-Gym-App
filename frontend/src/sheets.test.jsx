// @vitest-environment happy-dom
import { act } from 'react'
import { fireEvent, within } from '@testing-library/react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { RecapSheet, workoutDetailSheet, WorkoutRow } from './sheets/history.jsx'
import { finishWorkout } from './sheets/session.jsx'
import { bwSheet, goalSheet } from './sheets/bodyweight.jsx'
import { useStore } from './store/useStore.js'
import { DEF } from './lib/profile/index.js'
import { useUI } from './store/useUI.js'

let container
let root

const screen = () => within(container)
// A Recap metric is a row of the shared Row primitive: its label, its figure and any change.
const rowOf = label => screen().getByText(label).closest('.lrow')
const typeInto = (field, value) => fireEvent.change(field, { target: { value } })
const nextTo = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

beforeAll(async () => {
  await import('./lib/body-paths.js')
})

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('RecapSheet', () => {
  it('renders headline numbers, deltas, and records for a month', async () => {
    useStore.getState().update(s => {
      s.workouts = [
        {
          id: 'w-jan',
          d: '2026-01-15',
          start: 1000,
          end: 1000 + 40 * 60000,
          entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }],
        },
        {
          id: 'w-feb',
          d: '2026-02-15',
          start: 2000,
          end: 2000 + 50 * 60000,
          entries: [{ id: '0025', sets: [{ w: 110, r: 5, done: true }] }],
        },
      ]
    })

    const close = vi.fn()
    await act(async () => {
      root.render(<RecapSheet start="2026-02-01" close={close} />)
    })

    expect(screen().getByRole('heading', { level: 3 }).textContent).toContain('February 2026')

    expect(rowOf('Workouts').textContent).toContain('1')
    expect(rowOf('Time trained').textContent).toContain('50 min')
    expect(rowOf('Volume').textContent).toContain('550\u00a0kg')
    expect(rowOf('Sets').textContent).toContain('1')

    expect(screen().getByRole('heading', { level: 4, name: 'Records' })).toBeTruthy()
    expect(container.textContent).not.toMatch(/\bPRs?\b|personal record/i)
    expect(container.textContent).not.toContain('Estimated 1RM records')

    fireEvent.click(screen().getByRole('button', { name: 'Previous month' }))
    expect(screen().getByRole('heading', { level: 3 }).textContent).toContain('January 2026')

    fireEvent.click(screen().getByRole('button', { name: /View calendar/ }))
    expect(close).toHaveBeenCalledTimes(1)
    expect(useUI.getState().sheets.length).toBe(1)
  })

  describe('delta badges', () => {
    const twoMonths = () => useStore.getState().update(s => {
      const w = (id, d, kg) => ({
        id, d, start: 1000, end: 1000 + 45 * 60000,
        entries: [{ id: '0025', sets: [{ w: kg, r: 5, done: true }, { w: kg, r: 5, done: true }] }],
      })
      s.workouts = [
        w('o1', '2026-10-02', 100), w('o2', '2026-10-09', 100), w('o3', '2026-10-16', 100),
        w('n1', '2026-11-03', 100),
      ]
    })

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-09T12:00:00'))
    })
    afterEach(() => { vi.useRealTimers() })

    it('shows no comparison for the month under way', async () => {
      twoMonths()
      await act(async () => { root.render(<RecapSheet start="2026-11-09" close={vi.fn()} />) })

      expect(screen().getByRole('heading', { level: 3 }).textContent).toBe('November 2026')
      expect(screen().getByText('So far')).toBeTruthy()
      for (const label of ['Workouts', 'Time trained', 'Volume', 'Sets']) expect(rowOf(label), label).toBeTruthy()
      expect(rowOf('Workouts').textContent, 'no change figure on a month under way').toBe('Workouts1')
      expect(container.textContent).not.toContain('%')
    })

    it('keeps the comparison on a finished month', async () => {
      twoMonths()
      await act(async () => { root.render(<RecapSheet start="2026-10-01" close={vi.fn()} />) })

      expect(screen().getByRole('heading', { level: 3 }).textContent).toBe('October 2026')
      expect(screen().queryByText('So far')).toBeNull()
      expect(rowOf('Workouts').textContent).toContain('+3')
      expect(rowOf('Sets').textContent).toContain('+6')
    })
  })

  it('renders empty month message when no workouts exist', async () => {
    await act(async () => {
      root.render(<RecapSheet start="2026-05-01" close={vi.fn()} />)
    })

    expect(container.textContent).toContain('No workouts in May 2026')
  })
})

describe('finishWorkout confirmation', () => {
  const activeWith = sets => ({
    id: 'active', name: 'Test workout', start: Date.now(), cur: 0,
    entries: [{ id: '0025', target: { mode: 'reps', reps: 5, weight: 100, bodyweight: false }, sets }],
  })

  it('finishes straight away when only an unticked warm-up remains', async () => {
    useStore.getState().update(s => {
      s.active = activeWith([
        { w: 40, r: 5, done: false, phase: 'warmup' },
        { w: 100, r: 8, done: true },
        { w: 100, r: 8, done: true },
      ])
    })

    await act(async () => { finishWorkout() })

    expect(useStore.getState().S.active).toBeNull()
    expect(useStore.getState().S.workouts.length).toBe(1)
  })

  it('asks honestly when only warm-ups are ticked', async () => {
    useStore.getState().update(s => {
      s.active = activeWith([
        { w: 40, r: 5, done: true, phase: 'warmup' },
        { w: 100, r: 8, done: false },
      ])
    })

    await act(async () => { finishWorkout() })

    expect(useStore.getState().S.active).not.toBeNull()
    const sheet = useUI.getState().sheets.at(-1)
    expect(sheet).toBeTruthy()
    await act(async () => { root.render(sheet.render(vi.fn())) })
    expect(container.textContent).toContain('Only warm-ups logged so far')
    expect(container.textContent).toContain('warm-up sets are ticked')
  })

  it('states how far the workout got when finishing early', async () => {
    useStore.getState().update(s => {
      s.active = {
        id: 'active', name: 'Test workout', start: Date.now(), cur: 0,
        entries: [
          { id: '0025', target: { mode: 'reps', reps: 5, weight: 100 }, sets: [{ w: 100, r: 5, done: true }] },
          { id: '0047', target: { mode: 'reps', reps: 5, weight: 40 }, sets: [{ w: 40, r: 5, done: false }, { w: 40, r: 5, done: false }] },
          { id: '0426', target: { mode: 'reps', reps: 5, weight: 40 }, sets: [{ w: 40, r: 5, done: false }] },
        ],
      }
    })

    await act(async () => { finishWorkout() })

    expect(useStore.getState().S.active).not.toBeNull()
    const sheet = useUI.getState().sheets.at(-1)
    await act(async () => { root.render(sheet.render(vi.fn())) })
    expect(container.textContent).toContain('Finish early?')
    expect(container.textContent).toContain('1 of 3 exercises done')
    expect(container.textContent).toContain('3 sets still unchecked')
  })
})

describe('weigh-in', () => {
  const openRequired = async onDone => {
    bwSheet({ required: true, onDone })
    const sheet = useUI.getState().sheets.at(-1)
    await act(async () => { root.render(sheet.render(vi.fn())) })
  }
  const field = () => screen().getByRole('textbox', { name: /^Body weight/ })

  it('has two step keys that say their step, and no row of step chips', async () => {
    useStore.getState().update(s => { s.unit = 'kg'; s.bodyweight = [{ d: '2026-01-01', w: 82.8, t: 1 }] })
    await openRequired(vi.fn())

    const down = screen().getByRole('button', { name: 'Decrease by 0.1 kg' })
    const up = screen().getByRole('button', { name: 'Increase by 0.1 kg' })
    expect([down.textContent, up.textContent]).toEqual(['−0.1', '+0.1'])
    expect(screen().queryAllByRole('button').filter(b => b.hasAttribute('aria-pressed')), 'no row of step chips').toHaveLength(0)

    fireEvent.click(up)
    expect(field().value).toBe('82.9')
  })

  it('takes a typed figure', async () => {
    useStore.getState().update(s => { s.unit = 'kg'; s.bodyweight = [{ d: '2026-01-01', w: 82.8, t: 1 }] })
    const onDone = vi.fn()
    await openRequired(onDone)

    expect(screen().getByRole('textbox', { name: 'Body weight (kg)' }).getAttribute('inputmode')).toBe('decimal')
    typeInto(field(), '81.4')
    fireEvent.click(screen().getByRole('button', { name: 'Save and start workout' }))

    expect(onDone).toHaveBeenCalledWith(81.4)
    expect(useStore.getState().S.bodyweight.at(-1).w).toBe(81.4)
  })

  it('holds a typed figure to the same range as the step keys once the field is left', async () => {
    useStore.getState().update(s => { s.unit = 'kg'; s.bodyweight = [{ d: '2026-01-01', w: 82.8, t: 1 }] })
    await openRequired(vi.fn())

    typeInto(field(), '8280')
    fireEvent.blur(field())
    expect(field().value).toBe('300')

    typeInto(field(), '0.4')
    fireEvent.blur(field())
    expect(field().value).toBe('1')
  })

  it('saves a typed figure inside the range even when Save is pressed without leaving the field', async () => {
    useStore.getState().update(s => { s.unit = 'lb'; s.bodyweight = [{ d: '2026-01-01', w: 182, t: 1 }] })
    const onDone = vi.fn()
    await openRequired(onDone)

    typeInto(field(), '18200')
    fireEvent.click(screen().getByRole('button', { name: 'Save and start workout' }))

    expect(onDone).toHaveBeenCalledWith(660)
    expect(useStore.getState().S.bodyweight.at(-1).w).toBe(660)
  })
})

describe('Record badges', () => {
  const recordWorkout = (w47 = 60) => ({
    id: 'w-rec', name: 'Push Day', d: '2026-03-01', start: 1000, end: 4000,
    entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }, { id: '0047', sets: [{ w: w47, r: 8, done: true }] }],
  })
  const earlier = {
    id: 'w-old', name: 'Push Day', d: '2026-02-01', start: 500, end: 900,
    entries: [{ id: '0025', sets: [{ w: 90, r: 5, done: true }] }, { id: '0047', sets: [{ w: 60, r: 8, done: true }] }],
  }
  const logged = w => useStore.getState().update(s => { s.workouts = [earlier, w] })

  it('names a Record on the Workout detail sheet, never PR', async () => {
    const w = recordWorkout()
    logged(w)
    await act(async () => { workoutDetailSheet(w) })
    const sheet = useUI.getState().sheets.at(-1)
    await act(async () => { root.render(sheet.render(vi.fn())) })
    expect(screen().getAllByText(/record/i).map(b => b.textContent)).toEqual(['Record'])
  })

  it('shows no Record on the first session of an exercise', async () => {
    const w = recordWorkout()
    useStore.getState().update(s => { s.workouts = [w] })
    await act(async () => { root.render(<WorkoutRow w={w} onClick={vi.fn()} />) })
    expect(screen().queryByText(/record/i)).toBeNull()
  })

  it('counts Records on a Workout row: 1 record, 2 records', async () => {
    const one = recordWorkout()
    logged(one)
    await act(async () => { root.render(<WorkoutRow w={one} onClick={vi.fn()} />) })
    expect(screen().getByText(/record/i).textContent).toBe('1 record')
    const two = recordWorkout(65)
    logged(two)
    await act(async () => { root.render(<WorkoutRow w={two} onClick={vi.fn()} />) })
    expect(screen().getByText(/record/i).textContent).toBe('2 records')
  })
})

describe('Workout detail sheet after a unit switch (ADR 0031)', () => {
  it('shows a kg Workout in pounds: Session body weight and every set', async () => {
    const w = {
      id: 'w-kg', name: 'Push Day', d: '2026-03-01', start: 1000, end: 4000, unit: 'kg', bw: 80,
      entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }],
    }
    useStore.getState().update(s => { s.unit = 'lb'; s.workouts = [w] })
    await act(async () => { workoutDetailSheet(w) })
    const sheet = useUI.getState().sheets.at(-1)
    await act(async () => { root.render(sheet.render(vi.fn())) })
    expect(screen().getByText(/176\.4\s*lb/)).toBeTruthy()
    expect(screen().getByText('220.5×5')).toBeTruthy()
  })
})

describe('WorkoutRow', () => {
  it('counts Work sets only, never a performed warm-up', async () => {
    const w = {
      id: 'w-warm', name: 'Push Day', d: '2026-03-01', start: 0, end: 60 * 60000,
      entries: [{ id: '0025', sets: [{ w: 20, r: 10, done: true, phase: 'warmup' }, { w: 40, r: 5, done: true, phase: 'warmup' }, { w: 95, r: 8, done: true }, { w: 95, r: 8, done: true }] }],
    }
    useStore.getState().update(s => { s.workouts = [w] })
    await act(async () => { root.render(<WorkoutRow w={w} onClick={vi.fn()} />) })
    expect(screen().getByRole('button', { name: 'Push Day, Sun 1 Mar, 2 sets' })).toBeTruthy()
    expect(screen().getByText(/2 sets/).textContent).toContain('2 sets')
  })
})

describe('WorkoutDetail', () => {
  it('reads a Set stamped in another unit from its Entry in the Profile unit', async () => {
    const workout = {
      id: 'w-lb-row',
      name: 'Push Day',
      d: '2026-03-01',
      unit: 'kg',
      start: 1000,
      end: 4000,
      entries: [{
        id: '0025',
        unit: 'kg',
        sets: [{ w: 100, r: 5, done: true, unit: 'lb' }],
      }],
    }

    await act(async () => {
      workoutDetailSheet(workout)
    })
    const sheet = useUI.getState().sheets.at(-1)
    expect(sheet).toBeTruthy()
    await act(async () => {
      root.render(sheet.render(vi.fn()))
    })

    expect(screen().getByText('45.4×5')).toBeTruthy()
  })

  it('renders exercise notes beneath completed sets when present', async () => {
    const workout = {
      id: 'w-1',
      name: 'Push Day',
      d: '2026-03-01',
      start: 1000,
      end: 4000,
      entries: [
        {
          id: '0025',
          sets: [{ w: 80, r: 8, done: true }],
          notes: 'Right shoulder felt tight on set 2',
        },
        {
          id: '0047',
          sets: [{ w: 0, r: 15, done: true }],
        },
      ],
    }

    await act(async () => {
      workoutDetailSheet(workout)
    })
    const sheet = useUI.getState().sheets.at(-1)
    expect(sheet).toBeTruthy()
    await act(async () => {
      root.render(sheet.render(vi.fn()))
    })

    const note = screen().getByText('Right shoulder felt tight on set 2')
    expect(screen().getAllByText(/felt tight/)).toHaveLength(1)
    expect(nextTo(screen().getByText('80×8'), note), 'beneath the first exercise\'s sets').toBe(true)
    expect(nextTo(note, screen().getByText('0×15')), 'and above the next exercise').toBe(true)
  })

  it('lists performed warm-up sets above performed work sets, and an exercise with none logged as no sets', async () => {
    const workout = {
      id: 'w-warm',
      name: 'Push Day',
      d: '2026-03-01',
      start: 1000,
      end: 4000,
      entries: [
        {
          id: '0025',
          sets: [
            { w: 20, r: 10, done: true, phase: 'warmup' },
            { w: 40, r: 5, done: true, phase: 'warmup' },
            { w: 45, r: 5, done: false, phase: 'warmup' },
            { w: 95, r: 8, done: true },
            { w: 95, r: 8, done: true },
            { w: 95, r: 8, done: false },
          ],
        },
        {
          id: '0047',
          sets: [{ w: 60, r: 10, done: true }],
        },
        {
          id: '0026',
          sets: [{ w: 20, r: 10, done: true, phase: 'warmup' }],
        },
        {
          id: '0027',
          sets: [{ w: 20, r: 10, done: false, phase: 'warmup' }, { w: 80, r: 5, done: false }],
        },
      ],
    }

    await act(async () => {
      workoutDetailSheet(workout)
    })
    const sheet = useUI.getState().sheets.at(-1)
    expect(sheet).toBeTruthy()
    await act(async () => {
      root.render(sheet.render(vi.fn()))
    })

    const warm = screen().getByText('Warm-up: 20×10 · 40×5')
    const work = screen().getByText('95×8 · 95×8')
    expect(nextTo(warm, work), 'warm-ups come first').toBe(true)

    expect(screen().getByText('60×10')).toBeTruthy()
    expect(screen().getByText('Warm-up: 20×10'), 'a warm-up-only exercise still lists its warm-up').toBeTruthy()
    expect(screen().getAllByText(/^Warm-up:/), 'only the two exercises that logged one').toHaveLength(2)
    expect(screen().getAllByText('no sets'), 'only the exercise that logged nothing').toHaveLength(1)
  })

  it('renders compact BodyMap and SessionMuscleDistribution after the exercises list with tap selection', async () => {
    const workout = {
      id: 'w-2',
      name: 'Push Day',
      d: '2026-03-01',
      start: 1000,
      end: 4000,
      entries: [
        {
          id: '0025',
          sets: [
            { w: 100, r: 5, done: true },
            { w: 100, r: 5, done: true },
          ],
        },
      ],
    }

    await act(async () => {
      workoutDetailSheet(workout)
    })
    const sheet = useUI.getState().sheets.at(-1)
    expect(sheet).toBeTruthy()
    await act(async () => {
      root.render(sheet.render(vi.fn()))
    })
    await act(async () => {
      await new Promise(r => setTimeout(r, 100))
    })

    const rows = screen().getAllByRole('button').filter(b => b.hasAttribute('aria-pressed') && !/effective sets|not trained/.test(b.getAttribute('aria-label') ?? ''))
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('Chest')

    const entry = screen().getByText('100×5 · 100×5')
    const del = screen().getByRole('button', { name: 'Delete' })
    expect(nextTo(entry, rows[0]), 'after the exercises').toBe(true)
    expect(nextTo(rows[0], del), 'before Delete').toBe(true)

    expect(rows[0].getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(rows[0])
    expect(rows[0].getAttribute('aria-pressed')).toBe('true')

    expect(screen().getByRole('button', { name: 'Chest, 2.0 effective sets' })).toBeTruthy()
    expect(screen().getByRole('button', { name: 'Calves, not trained' })).toBeTruthy()
  })
})

describe('destructive confirms', () => {
  const click = el => fireEvent.click(el)
  const show = async sheet => { await act(async () => { root.render(sheet.render(vi.fn())) }) }
  const button = name => screen().getByRole('button', { name })

  it('deletes a weigh-in only after confirm, and leaves the log sheet open', async () => {
    useStore.getState().update(s => { s.unit = 'kg'; s.bodyweight = [{ d: '2026-01-01', w: 80, t: 1 }, { d: '2026-01-02', w: 81, t: 2 }] })
    bwSheet()
    const log = useUI.getState().sheets.at(-1)
    const closeLog = vi.fn()
    await act(async () => { root.render(log.render(closeLog)) })

    const [del] = screen().getAllByRole('button', { name: /^Delete entry for / })
    await click(del)
    expect(useStore.getState().S.bodyweight).toHaveLength(2)

    const confirm = useUI.getState().sheets.at(-1)
    await show(confirm)
    expect(container.textContent).toContain(`${del.getAttribute('aria-label')}?`)
    expect(container.textContent).toBe(`${del.getAttribute('aria-label')}?${button('Delete').textContent}${button('Cancel').textContent}`)
    await click(button('Cancel'))
    expect(useStore.getState().S.bodyweight).toHaveLength(2)

    await click(button('Delete'))
    expect(useStore.getState().S.bodyweight).toHaveLength(1)
    expect(closeLog).not.toHaveBeenCalled()
  })

  it('clears the goal only after confirm, then toasts and closes', async () => {
    useStore.getState().update(s => { s.unit = 'kg'; s.targetW = 75; s.bodyweight = [{ d: '2026-01-01', w: 80, t: 1 }] })
    goalSheet()
    const goal = useUI.getState().sheets.at(-1)
    const closeGoal = vi.fn()
    await act(async () => { root.render(goal.render(closeGoal)) })

    await click(button('Delete goal'))
    expect(useStore.getState().S.targetW).toBe(75)
    expect(closeGoal).not.toHaveBeenCalled()

    const confirm = useUI.getState().sheets.at(-1)
    await show(confirm)
    expect(container.textContent).toContain('Delete goal?')
    expect(container.textContent).toBe(`Delete goal?${button('Delete').textContent}${button('Cancel').textContent}`)
    await click(button('Delete'))
    expect(useStore.getState().S.targetW).toBeNull()
    expect(useUI.getState().toastMsg).toBe('Goal deleted')
    expect(closeGoal).toHaveBeenCalledOnce()
  })
})

