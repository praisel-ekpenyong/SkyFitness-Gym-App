// @vitest-environment happy-dom
import { act } from 'react'
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

    const header = container.querySelector('h3')
    expect(header?.textContent).toContain('February 2026')

    const headlineSection = container.querySelectorAll('.sect-b')[0]
    const rows = Array.from(headlineSection.querySelectorAll('.lrow'))
    expect(rows.length).toBe(4)
    expect(rows[0].textContent).toContain('Workouts')
    expect(rows[0].textContent).toContain('1')
    expect(rows[1].textContent).toContain('Time trained')
    expect(rows[1].textContent).toContain('50 min')
    expect(rows[2].textContent).toContain('Volume')
    expect(rows[2].textContent).toContain('550\u00a0kg')
    expect(rows[3].textContent).toContain('Sets')
    expect(rows[3].textContent).toContain('1')

    expect([...container.querySelectorAll('h4.sec')].map(h => h.textContent)).toContain('Records')
    expect(container.textContent).not.toMatch(/\bPRs?\b|personal record/i)
    expect(container.textContent).not.toContain('Estimated 1RM records')

    const prevBtn = container.querySelector('button[aria-label="Previous month"]')
    expect(prevBtn).toBeTruthy()
    await act(async () => {
      prevBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('h3')?.textContent).toContain('January 2026')

    const calBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('View calendar'))
    expect(calBtn).toBeTruthy()
    await act(async () => {
      calBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
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

      expect(container.querySelector('h3')?.textContent).toBe('November 2026')
      expect(container.querySelector('.recap-sofar')?.textContent).toBe('So far')
      const rows = container.querySelectorAll('.sect-b')[0].querySelectorAll('.lrow')
      expect(rows.length).toBe(4)
      expect(container.querySelectorAll('.delta-pill').length).toBe(0)
      expect(container.textContent).not.toContain('%')
    })

    it('keeps the comparison on a finished month', async () => {
      twoMonths()
      await act(async () => { root.render(<RecapSheet start="2026-10-01" close={vi.fn()} />) })

      expect(container.querySelector('h3')?.textContent).toBe('October 2026')
      expect(container.querySelector('.recap-sofar')).toBeNull()
      expect(container.querySelectorAll('.delta-pill').length).toBe(4)
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
  const click = async el => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }

  it('has two step keys that say their step, and no row of step chips', async () => {
    useStore.getState().update(s => { s.unit = 'kg'; s.bodyweight = [{ d: '2026-01-01', w: 82.8, t: 1 }] })
    await openRequired(vi.fn())

    const keys = [...container.querySelectorAll('.bw-pm')]
    expect(keys.map(k => k.textContent)).toEqual(['−0.1', '+0.1'])
    expect(keys.map(k => k.getAttribute('aria-label'))).toEqual(['Decrease by 0.1 kg', 'Increase by 0.1 kg'])
    expect(container.querySelector('.chip')).toBeNull()

    await click(keys[1])
    expect(container.querySelector('.bw-num').value).toBe('82.9')
  })

  it('takes a typed figure', async () => {
    useStore.getState().update(s => { s.unit = 'kg'; s.bodyweight = [{ d: '2026-01-01', w: 82.8, t: 1 }] })
    const onDone = vi.fn()
    await openRequired(onDone)

    const field = container.querySelector('input.bw-num')
    expect(field.getAttribute('aria-label')).toBe('Body weight (kg)')
    expect(field.getAttribute('inputmode')).toBe('decimal')
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, '81.4')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Save and start workout'))

    expect(onDone).toHaveBeenCalledWith(81.4)
    expect(useStore.getState().S.bodyweight.at(-1).w).toBe(81.4)
  })

  const type = async (field, raw) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, raw)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('holds a typed figure to the same range as the step keys once the field is left', async () => {
    useStore.getState().update(s => { s.unit = 'kg'; s.bodyweight = [{ d: '2026-01-01', w: 82.8, t: 1 }] })
    await openRequired(vi.fn())

    const field = container.querySelector('input.bw-num')
    await type(field, '8280')
    await act(async () => { field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(field.value).toBe('300')

    await type(field, '0.4')
    await act(async () => { field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(field.value).toBe('1')
  })

  it('saves a typed figure inside the range even when Save is pressed without leaving the field', async () => {
    useStore.getState().update(s => { s.unit = 'lb'; s.bodyweight = [{ d: '2026-01-01', w: 182, t: 1 }] })
    const onDone = vi.fn()
    await openRequired(onDone)

    await type(container.querySelector('input.bw-num'), '18200')
    await click([...container.querySelectorAll('button')].find(b => b.textContent === 'Save and start workout'))

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
    expect([...container.querySelectorAll('.pr')].map(b => b.textContent)).toEqual(['Record'])
  })

  it('shows no Record on the first session of an exercise', async () => {
    const w = recordWorkout()
    useStore.getState().update(s => { s.workouts = [w] })
    await act(async () => { root.render(<WorkoutRow w={w} onClick={vi.fn()} />) })
    expect(container.querySelector('.pr')).toBeNull()
  })

  it('counts Records on a Workout row: 1 record, 2 records', async () => {
    const one = recordWorkout()
    logged(one)
    await act(async () => { root.render(<WorkoutRow w={one} onClick={vi.fn()} />) })
    expect(container.querySelector('.pr')?.textContent).toBe('1 record')
    const two = recordWorkout(65)
    logged(two)
    await act(async () => { root.render(<WorkoutRow w={two} onClick={vi.fn()} />) })
    expect(container.querySelector('.pr')?.textContent).toBe('2 records')
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
    expect(container.querySelector('.sheet-sub').textContent).toContain('176.4\u00a0lb')
    expect(container.querySelector('.ex-entry .ss').textContent).toBe('220.5×5')
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
    expect(container.querySelector('.item').getAttribute('aria-label')).toBe('Push Day, Sun 1 Mar, 2 sets')
    expect(container.querySelector('.ss').textContent).toContain('2 sets')
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

    expect(container.querySelector('.ss')?.textContent).toBe('45.4×5')
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

    const noteDiv = container.querySelector('.exnote')
    expect(noteDiv).toBeTruthy()
    expect(noteDiv.textContent).toBe('Right shoulder felt tight on set 2')

    const exRows = container.querySelectorAll('.row')
    expect(exRows[0].querySelector('.exnote')?.textContent).toBe('Right shoulder felt tight on set 2')
    expect(exRows[1].querySelector('.exnote')).toBeNull()
  })

  it('renders performed warm-up sets in .ss-warm above performed work sets in .ss', async () => {
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

    const exRows = container.querySelectorAll('.ex-entry')
    expect(exRows.length).toBe(4)

    // Entry 0: Warm-ups + Work sets
    const row0Warm = exRows[0].querySelector('.ss-warm')
    const row0Work = exRows[0].querySelector('.ss')
    expect(row0Warm).toBeTruthy()
    expect(row0Warm.textContent).toBe('Warm-up: 20×10  ·  40×5')
    expect(row0Work).toBeTruthy()
    expect(row0Work.textContent).toBe('95×8  ·  95×8')
    expect(row0Warm.compareDocumentPosition(row0Work) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Entry 1: Work sets only (no .ss-warm)
    expect(exRows[1].querySelector('.ss-warm')).toBeNull()
    expect(exRows[1].querySelector('.ss')?.textContent).toBe('60×10')

    // Entry 2: Warm-ups only (renders .ss-warm, no 'no sets' fallback)
    const row2Warm = exRows[2].querySelector('.ss-warm')
    expect(row2Warm).toBeTruthy()
    expect(row2Warm.textContent).toBe('Warm-up: 20×10')
    expect(exRows[2].querySelector('.ss')).toBeNull()
    expect(exRows[2].textContent).not.toContain('no sets')

    // Entry 3: Zero performed sets (renders 'no sets', no .ss-warm)
    expect(exRows[3].querySelector('.ss-warm')).toBeNull()
    expect(exRows[3].querySelector('.ss')?.textContent).toBe('no sets')
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

    const distContainer = container.querySelector('.workout-detail-distribution')
    expect(distContainer).toBeTruthy()

    const entry = container.querySelector('.ex-entry')
    const del = [...container.querySelectorAll('button')].find(b => b.textContent === 'Delete workout')
    expect(entry.compareDocumentPosition(distContainer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(distContainer.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const bodyMap = distContainer?.querySelector('.bodymap')
    expect(bodyMap).toBeTruthy()
    expect(bodyMap?.classList.contains('compact')).toBe(true)

    const distRows = distContainer?.querySelectorAll('.smd-row')
    expect(distRows?.length).toBe(3)
    expect(distRows?.[0].textContent).toContain('Chest')

    await act(async () => {
      distRows?.[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(distRows?.[0].classList.contains('selected')).toBe(true)

    const chestButton = distContainer?.querySelector('.bodymap [role="button"][aria-label*="Chest"]')
    expect(chestButton?.getAttribute('aria-label')).toBe('Chest, 2.0 effective sets')
    const calvesButton = distContainer?.querySelector('.bodymap [role="button"][aria-label*="Calves"]')
    expect(calvesButton?.getAttribute('aria-label')).toBe('Calves, not trained')
  })
})

describe('destructive confirms', () => {
  const click = async el => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) }) }
  const show = async sheet => { await act(async () => { root.render(sheet.render(vi.fn())) }) }
  const button = name => [...container.querySelectorAll('button')].find(b => b.textContent === name || b.getAttribute('aria-label') === name)

  it('deletes a weigh-in only after confirm, and leaves the log sheet open', async () => {
    useStore.getState().update(s => { s.unit = 'kg'; s.bodyweight = [{ d: '2026-01-01', w: 80, t: 1 }, { d: '2026-01-02', w: 81, t: 2 }] })
    bwSheet()
    const log = useUI.getState().sheets.at(-1)
    const closeLog = vi.fn()
    await act(async () => { root.render(log.render(closeLog)) })

    const del = [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label')?.startsWith('Delete entry for '))
    await click(del)
    expect(useStore.getState().S.bodyweight).toHaveLength(2)

    const confirm = useUI.getState().sheets.at(-1)
    await show(confirm)
    expect(container.textContent).toContain(`${del.getAttribute('aria-label')}?`)
    expect(container.querySelector('.confirm-msg').textContent).toBe('')
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

    await click(button('Remove goal'))
    expect(useStore.getState().S.targetW).toBe(75)
    expect(closeGoal).not.toHaveBeenCalled()

    const confirm = useUI.getState().sheets.at(-1)
    await show(confirm)
    expect(container.textContent).toContain('Remove goal?')
    expect(container.querySelector('.confirm-msg').textContent).toBe('')
    await click(button('Remove'))
    expect(useStore.getState().S.targetW).toBeNull()
    expect(useUI.getState().toastMsg).toBe('Goal removed')
    expect(closeGoal).toHaveBeenCalledOnce()
  })
})

