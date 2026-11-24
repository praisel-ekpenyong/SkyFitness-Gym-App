// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Calendar } from './sheets/history.jsx'
import { useStore } from './store/useStore.js'
import { DEF } from './lib/profile/index.js'
import { useUI } from './store/useUI.js'

// Clock: Wed 1 Jul 2026, so the current week starts Mon 29 Jun.
const NOW = new Date(2026, 6, 1, 12)
const trained = d => ({ id: `w-${d}`, d, name: 'Push', entries: [{ id: 'lift', sets: [{ done: true, w: 60, r: 5 }] }] })
// Counted: 11, 18, 25 May and 1 Jun (a run of four); 8 Jun missed (broke);
// 15 Jun counted; 22 Jun missed (broke); this week open.
const HISTORY = ['2026-05-11', '2026-05-18', '2026-05-25', '2026-06-01', '2026-06-15'].map(trained)

let container
let root

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
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
  vi.useRealTimers()
})

const render = async (start, workouts = HISTORY, extra = {}) => {
  useStore.getState().update(s => { s.workouts = workouts; Object.assign(s, extra) })
  await act(async () => { root.render(<Calendar start={start} close={() => {}} />) })
}
const marks = () => [...container.querySelectorAll('button.cal-mark')]
const mark = label => marks().find(b => b.getAttribute('aria-label') === label)
const explanation = () => container.querySelector('.cal-explain')?.textContent ?? ''
const header = () => container.querySelector('.cal-streak')?.textContent ?? ''
const tap = async label => { await act(async () => { mark(label).click() }) }

describe('Calendar week marks', () => {
  it('a mark sits at the end of each week row, labelled by week and state', async () => {
    await render('2026-06-01T12:00:00')
    expect(marks().map(b => b.getAttribute('aria-label'))).toEqual([
      'Week of 1 Jun: counted',
      'Week of 8 Jun: broke',
      'Week of 15 Jun: counted',
      'Week of 22 Jun: broke',
      'Week of 29 Jun: open',
    ])
  })

  it('shows no marks before the first counted week', async () => {
    await render('2026-05-01T12:00:00')
    expect(marks().map(b => b.getAttribute('aria-label'))).toEqual([
      'Week of 11 May: counted',
      'Week of 18 May: counted',
      'Week of 25 May: counted',
    ])
  })

  it('a week with no workout and nothing left to break is labelled missed', async () => {
    // One counted week in May, then no workouts: the next week breaks it, and the weeks after are missed.
    await render('2026-06-01T12:00:00', [trained('2026-05-11')])
    expect(marks().map(b => b.getAttribute('aria-label'))).toEqual([
      'Week of 1 Jun: missed',
      'Week of 8 Jun: missed',
      'Week of 15 Jun: missed',
      'Week of 22 Jun: missed',
      'Week of 29 Jun: open',
    ])
  })

  it('tapping a mark selects that week and explains it', async () => {
    await render('2026-06-01T12:00:00')
    expect(explanation()).toBe('')
    await tap('Week of 1 Jun: counted')
    expect(explanation()).toBe('You trained, so this week counts. Streak: 4.')
    expect(mark('Week of 1 Jun: counted').getAttribute('aria-pressed')).toBe('true')
    await tap('Week of 15 Jun: counted')
    expect(explanation()).toBe('You trained, so this week counts. Streak: 1.')
  })

  it('explains a broken week and an open week', async () => {
    await render('2026-06-01T12:00:00')
    await tap('Week of 8 Jun: broke')
    expect(explanation()).toBe('No workout, so the streak started over.')
    await tap('Week of 29 Jun: open')
    expect(explanation()).toBe('Still open. One workout and it counts.')
  })

  it('an old Profile\'s stored streakRule changes no mark', async () => {
    await render('2026-06-01T12:00:00', HISTORY, { streakRule: 'generous' })
    expect(mark('Week of 8 Jun: broke')).toBeTruthy()
    await tap('Week of 8 Jun: broke')
    expect(explanation()).toBe('No workout, so the streak started over.')
  })

  it('changing month clears the selected week and its explanation', async () => {
    await render('2026-06-01T12:00:00')
    await tap('Week of 15 Jun: counted')
    expect(explanation()).toBe('You trained, so this week counts. Streak: 1.')
    const nav = label => act(async () => { container.querySelector(`button[aria-label="${label}"]`).click() })
    await nav('Previous month')
    expect(explanation()).toBe('')
    expect(container.querySelector('button.cal-mark[aria-pressed="true"]')).toBeNull()
    await nav('Next month')
    expect(explanation()).toBe('')
    expect(mark('Week of 15 Jun: counted').getAttribute('aria-pressed')).toBe('false')
  })

  it('marks are buttons with an accessible name', async () => {
    await render('2026-06-01T12:00:00')
    expect(marks().every(b => b.tagName === 'BUTTON' && b.getAttribute('aria-label'))).toBe(true)
  })
})

describe('Calendar streak header', () => {
  it('shows the current and best weeks in a row', async () => {
    await render('2026-06-01T12:00:00')
    expect(header()).toContain('Streak 0 weeks')
    expect(header()).toContain('Best 4 weeks')
  })

  it('an open current week that is counted adds to the current streak', async () => {
    await render('2026-06-01T12:00:00', [...HISTORY, trained('2026-06-29')])
    expect(header()).toContain('Streak 1 week')
    expect(header()).toContain('Best 4 weeks')
  })

  it('has no freezes and no rule picker', async () => {
    await render('2026-06-01T12:00:00')
    expect(container.textContent.toLowerCase()).not.toContain('freeze')
    expect(container.querySelector('[role="radiogroup"]')).toBeNull()
    expect(container.querySelector('[role="radio"]')).toBeNull()
  })
})
