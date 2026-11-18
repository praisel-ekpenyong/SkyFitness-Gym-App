// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Stats from './Stats.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { todayISO, isoOf } from '../lib/dates.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../sheets/bodyweight.jsx', () => ({ bwSheet: () => {}, goalSheet: () => {} }))
vi.mock('../sheets/history.jsx', () => ({
  calendarSheet: () => {}, recapSheet: () => {}, workoutDetailSheet: () => {}, WorkoutRow: () => null,
}))
vi.mock('../sheets/volume.jsx', () => ({ volumeRangesSheet: () => {} }))
vi.mock('../components/LineChart.jsx', () => ({ default: () => null }))
vi.mock('../components/Heatmap.jsx', () => ({ default: () => null }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null, BodyMapLegend: () => null }))

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
})

// A counted workout (a performed work set) on the same weekday, the given number of weeks ago.
function trainedWeeksAgo(n) {
  const d = new Date(todayISO() + 'T12:00:00')
  d.setDate(d.getDate() - 7 * n)
  return { id: `w-${n}`, d: isoOf(d), name: 'Push', entries: [{ id: 'lift', sets: [{ done: true, w: 60, r: 5 }] }] }
}

function kpi(label) {
  return [...container.querySelectorAll('.stats-kpis .tile')].find(el => el.querySelector('.l')?.textContent === label)
}

describe('Stats counts row streak', () => {
  it('shows the current and best week streak from the overview', async () => {
    // This week and last week, both counted: a streak of two, and the best too.
    useStore.getState().update(s => { s.workouts = [trainedWeeksAgo(1), trainedWeeksAgo(0)] })

    await act(async () => { root.render(<Stats />) })

    expect(kpi('Streak now').querySelector('.v').textContent).toBe('2 weeks')
    expect(kpi('Best streak').querySelector('.v').textContent).toBe('2 weeks')
  })

  it('keeps best above current once a missed week breaks the run', async () => {
    // Two counted weeks, then a missed week that Gentle cannot cover, then this week counted again.
    useStore.getState().update(s => { s.workouts = [trainedWeeksAgo(3), trainedWeeksAgo(2), trainedWeeksAgo(0)] })

    await act(async () => { root.render(<Stats />) })

    expect(kpi('Streak now').querySelector('.v').textContent).toBe('1 week')
    expect(kpi('Best streak').querySelector('.v').textContent).toBe('2 weeks')
  })
})
