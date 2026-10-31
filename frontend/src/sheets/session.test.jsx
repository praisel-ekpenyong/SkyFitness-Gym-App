// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FinishSummary, configureSessionSheets } from './session.jsx'
import SessionMuscleDistribution from '../components/SessionMuscleDistribution.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { setNav } from '../lib/nav.js'

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  setNav(() => {})

  useStore.setState({
    S: {
      ...DEF,
      unit: 'kg',
      workouts: [],
      active: null,
    },
  })
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })

  configureSessionSheets({
    bwSheet: vi.fn(),
    confirmSheet: vi.fn(),
    WeightInput: () => null,
  })

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

describe('SessionMuscleDistribution Component', () => {
  it('renders distribution rows with proportional load bars, effective sets and subtitle breakdowns', async () => {
    const workout = {
      id: 'w-1',
      d: '2026-03-01',
      start: 1000,
      end: 3000,
      entries: [
        {
          id: '0025', // Barbell Bench Press (primary: chest, secondaries: triceps, deltoids)
          sets: [
            { w: 100, r: 8, done: true },
            { w: 100, r: 8, done: true },
            { w: 100, r: 8, done: true },
          ],
        },
      ],
    }

    const onSelect = vi.fn()
    await act(async () => {
      root.render(
        <SessionMuscleDistribution
          workout={workout}
          selectedMuscle={null}
          onSelectMuscle={onSelect}
        />
      )
    })

    const rows = container.querySelectorAll('.smd-row')
    expect(rows.length).toBe(3) // Chest, Shoulders, Triceps

    // First row: Chest (3.0 effective sets = 100% bar)
    expect(rows[0].textContent).toContain('Chest')
    expect(rows[0].textContent).toContain('3 sets')
    expect(rows[0].textContent).toContain('3 direct sets')
    const chestBar = rows[0].querySelector('.bar i')
    expect(chestBar?.style.width).toBe('100%')

    // Second row: Shoulders (1.2 effective sets = 40% bar)
    expect(rows[1].textContent).toContain('Shoulders')
    expect(rows[1].textContent).toContain('1.2 sets')
    expect(rows[1].textContent).toContain('1.2 assist (3 compound sets)')
    const shouldersBar = rows[1].querySelector('.bar i')
    expect(shouldersBar?.style.width).toBe('40%')

    // Third row: Triceps (1.2 effective sets = 40% bar)
    expect(rows[2].textContent).toContain('Triceps')
    expect(rows[2].textContent).toContain('1.2 sets')
    expect(rows[2].textContent).toContain('1.2 assist (3 compound sets)')
    const tricepsBar = rows[2].querySelector('.bar i')
    expect(tricepsBar?.style.width).toBe('40%')
  })

  it('renders direct + assist subtitle when a muscle receives both primary and compound support', async () => {
    const workout = {
      id: 'w-combo',
      d: '2026-03-01',
      start: 1000,
      end: 3000,
      entries: [
        {
          id: '0025', // Bench: chest 1.0, triceps 0.4
          sets: [
            { w: 80, r: 5, done: true },
            { w: 80, r: 5, done: true },
            { w: 80, r: 5, done: true },
          ],
        },
        {
          id: '0018', // Triceps extension: triceps 1.0
          sets: [
            { w: 20, r: 10, done: true },
            { w: 20, r: 10, done: true },
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<SessionMuscleDistribution workout={workout} />)
    })

    const tricepsRow = Array.from(container.querySelectorAll('.smd-row')).find(r => r.textContent.includes('Triceps'))
    expect(tricepsRow).toBeTruthy()
    // 2 direct + 1.2 assist
    expect(tricepsRow?.textContent).toContain('2 direct + 1.2 assist')
    expect(tricepsRow?.textContent).toContain('3.2 sets')
  })

  it('toggles selection and highlights the selected row with .selected', async () => {
    const workout = {
      id: 'w-1',
      entries: [
        {
          id: '0025',
          sets: [{ w: 80, r: 8, done: true }],
        },
      ],
    }

    const onSelect = vi.fn()
    await act(async () => {
      root.render(
        <SessionMuscleDistribution
          workout={workout}
          selectedMuscle="chest"
          onSelectMuscle={onSelect}
        />
      )
    })

    const rows = container.querySelectorAll('.smd-row')
    expect(rows[0].classList.contains('selected')).toBe(true)
    expect(rows[0].getAttribute('aria-pressed')).toBe('true')
    expect(rows[1].classList.contains('selected')).toBe(false)
    expect(rows[1].getAttribute('aria-pressed')).toBe('false')

    // Click row to toggle
    await act(async () => {
      rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onSelect).toHaveBeenCalledWith('chest')
  })

  it('limits to top 4 muscles by default and expands via accessible disclosure button when >4 muscles', async () => {
    const workout = {
      id: 'w-fullbody',
      entries: [
        {
          id: '0025', // chest (1.0), deltoids (0.4), triceps (0.4)
          sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }],
        },
        {
          id: '0043', // gluteal (1.0), quadriceps (0.4), hamstring (0.4)
          sets: [{ w: 120, r: 5, done: true }, { w: 120, r: 5, done: true }],
        },
      ],
    }

    await act(async () => {
      root.render(<SessionMuscleDistribution workout={workout} />)
    })

    // Total 8 muscles: chest, deltoids, triceps, gluteal, quadriceps, hamstring, calves, abs
    const initialRows = container.querySelectorAll('.smd-row')
    expect(initialRows.length).toBe(4)

    // Disclosure button should be present
    const toggleBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Show all'))
    expect(toggleBtn).toBeTruthy()
    expect(toggleBtn?.textContent).toContain('Show all (8)')
    expect(toggleBtn?.getAttribute('aria-expanded')).toBe('false')

    // Expand
    await act(async () => {
      toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const expandedRows = container.querySelectorAll('.smd-row')
    expect(expandedRows.length).toBe(8)

    const collapseBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Show less'))
    expect(collapseBtn).toBeTruthy()
    expect(collapseBtn?.getAttribute('aria-expanded')).toBe('true')

    // Collapse back
    await act(async () => {
      collapseBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(container.querySelectorAll('.smd-row').length).toBe(4)
  })

  it('renders fallback notice when workout has zero completed work sets', async () => {
    const workout = {
      entries: [
        {
          id: '0025',
          sets: [
            { w: 50, r: 10, done: true, warmup: true }, // warmup only
            { w: 100, r: 8, done: false }, // undone
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<SessionMuscleDistribution workout={workout} />)
    })

    expect(container.textContent).toContain('No performed work sets in this session')
    expect(container.querySelectorAll('.smd-row').length).toBe(0)
  })
})

describe('FinishSummary with SessionMuscleDistribution', () => {
  it('renders SessionMuscleDistribution companion below BodyMap with bidirectional selection', async () => {
    const w = {
      id: 'w-summary',
      d: '2026-03-01',
      start: 1000,
      end: 4000,
      entries: [
        {
          id: '0025', // Bench: chest, deltoids, triceps
          sets: [
            { w: 80, r: 8, done: true },
            { w: 80, r: 8, done: true },
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={[]} close={vi.fn()} />)
    })

    // Header "What you just trained" exists
    expect(container.textContent).toContain('What you just trained')

    // Distribution component exists under BodyMap
    const dist = container.querySelector('.session-muscle-distribution')
    expect(dist).toBeTruthy()

    const rows = dist?.querySelectorAll('.smd-row')
    expect(rows?.length).toBe(3)
    expect(rows?.[0].textContent).toContain('Chest')

    // Tap chest row -> selects chest
    await act(async () => {
      rows?.[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rows?.[0].classList.contains('selected')).toBe(true)

    // Tap chest row again -> deselects
    await act(async () => {
      rows?.[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rows?.[0].classList.contains('selected')).toBe(false)
  })
})
