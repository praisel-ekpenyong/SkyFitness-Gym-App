// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RecapSheet, recapSheet, finishWorkout, workoutDetailSheet } from './sheets.jsx'
import { useStore, DEF } from './store/useStore.js'
import { useUI } from './store/useUI.js'

let container
let root

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
          prs: ['0025'],
        },
        {
          id: 'w-feb',
          d: '2026-02-15',
          start: 2000,
          end: 2000 + 50 * 60000,
          entries: [{ id: '0025', sets: [{ w: 110, r: 5, done: true }] }],
          prs: ['0025'],
        },
      ]
    })

    const close = vi.fn()
    await act(async () => {
      root.render(<RecapSheet start="2026-02-01" close={close} />)
    })

    // Header with month title
    const header = container.querySelector('h3')
    expect(header?.textContent).toContain('February 2026')

    // Headline numbers
    const headlineSection = container.querySelectorAll('.sect-b')[0]
    const rows = Array.from(headlineSection.querySelectorAll('.lrow'))
    expect(rows.length).toBe(4)
    expect(rows[0].textContent).toContain('Workouts')
    expect(rows[0].textContent).toContain('1')
    expect(rows[1].textContent).toContain('Time trained')
    expect(rows[1].textContent).toContain('50 min')
    expect(rows[2].textContent).toContain('Volume')
    expect(rows[2].textContent).toContain('550 kg')
    expect(rows[3].textContent).toContain('Sets')
    expect(rows[3].textContent).toContain('1')

    // Records section should list the PR and Estimated 1RM record
    expect(container.textContent).toContain('Personal records')
    expect(container.textContent).toContain('Estimated 1RM records')

    // Month navigation: click previous month
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

  it('renders empty month message when no workouts exist', async () => {
    await act(async () => {
      root.render(<RecapSheet start="2026-05-01" close={vi.fn()} />)
    })

    expect(container.textContent).toContain('No workouts in May 2026')
  })
})

describe('finishWorkout confirmation', () => {
  // The deleted __probe2.test.js proved the confirm counted an unticked warm-up as an
  // unchecked set while the finish button said everything was done. Both now read
  // sessionProgress (GLOSSARY.md: Session progress), so the confirm only ever asks
  // about work sets.
  const activeWith = sets => ({
    id: 'active', name: 'Test workout', start: Date.now(), cur: 0,
    entries: [{ id: '0025', target: { mode: 'reps', reps: 5, weight: 100, bodyweight: false }, sets }],
  })

  it('finishes straight away when only an unticked warm-up remains', async () => {
    useStore.getState().update(s => {
      s.active = activeWith([
        { w: 40, r: 5, done: false, phase: 'warmup', warmup: true },
        { w: 100, r: 8, done: true },
        { w: 100, r: 8, done: true },
      ])
    })

    await act(async () => { finishWorkout() })

    // No confirm blocked it: the session closed and the workout landed in history.
    expect(useStore.getState().S.active).toBeNull()
    expect(useStore.getState().S.workouts.length).toBe(1)
  })

  it('asks honestly when only warm-ups are ticked', async () => {
    useStore.getState().update(s => {
      s.active = activeWith([
        { w: 40, r: 5, done: true, phase: 'warmup', warmup: true },
        { w: 100, r: 8, done: false },
      ])
    })

    await act(async () => { finishWorkout() })

    // The session survives until confirmed, and the confirm names warm-ups, not "sets".
    expect(useStore.getState().S.active).not.toBeNull()
    const sheet = useUI.getState().sheets.at(-1)
    expect(sheet).toBeTruthy()
    await act(async () => { root.render(sheet.render(vi.fn())) })
    expect(container.textContent).toContain('Only warm-ups logged so far')
    expect(container.textContent).toContain('warm-up sets are ticked')
  })
})

describe('WorkoutDetail', () => {
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
})

