// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { FinishSummary, configureSessionSheets } from './session.jsx'
import SessionMuscleDistribution from '../components/SessionMuscleDistribution.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { setNav } from '../lib/nav.js'

let container
let root

beforeAll(async () => {
  await import('../lib/body-paths.js')
})

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
          id: '0025',
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
    expect(rows.length).toBe(3)

    expect(rows[0].textContent).toContain('Chest')
    expect(rows[0].textContent).toContain('3 sets')
    expect(rows[0].textContent).toContain('3 direct sets')
    const chestBar = rows[0].querySelector('.bar i')
    expect(chestBar?.style.width).toBe('100%')

    expect(rows[1].textContent).toContain('Front delts')
    expect(rows[1].textContent).toContain('1.2 sets')
    expect(rows[1].textContent).toContain('1.2 assist (3 compound sets)')
    const shouldersBar = rows[1].querySelector('.bar i')
    expect(shouldersBar?.style.width).toBe('40%')

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
          id: '0025',
          sets: [
            { w: 80, r: 5, done: true },
            { w: 80, r: 5, done: true },
            { w: 80, r: 5, done: true },
          ],
        },
        {
          id: '0018',
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
    expect(tricepsRow?.textContent).toContain('2 direct + 1.2 assist (3 compound sets)')
    expect(tricepsRow?.textContent).toContain('3.2 sets')
  })

  it('renders singular 1 compound set when exactly one compound set supports the muscle', async () => {
    const workout = {
      entries: [
        {
          id: '0025',
          sets: [{ w: 80, r: 5, done: true }],
        },
        {
          id: '0018',
          sets: [{ w: 20, r: 10, done: true }, { w: 20, r: 10, done: true }],
        },
      ],
    }
    await act(async () => {
      root.render(<SessionMuscleDistribution workout={workout} />)
    })
    const tricepsRow = Array.from(container.querySelectorAll('.smd-row')).find(r => r.textContent.includes('Triceps'))
    expect(tricepsRow?.textContent).toContain('2 direct + 0.4 assist (1 compound set)')
  })

  it('renders singular 1 direct set and singular assist-only 1 compound set', async () => {
    const workout = {
      entries: [
        {
          id: '0025',
          sets: [{ w: 80, r: 5, done: true }],
        },
      ],
    }
    await act(async () => {
      root.render(<SessionMuscleDistribution workout={workout} />)
    })
    const chestRow = Array.from(container.querySelectorAll('.smd-row')).find(r => r.textContent.includes('Chest'))
    expect(chestRow?.textContent).toContain('1 direct set')

    const tricepsRow = Array.from(container.querySelectorAll('.smd-row')).find(r => r.textContent.includes('Triceps'))
    expect(tricepsRow?.textContent).toContain('0.4 assist (1 compound set)')
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
          id: '0025',
          sets: [{ w: 100, r: 5, done: true }, { w: 100, r: 5, done: true }],
        },
        {
          id: '0043',
          sets: [{ w: 120, r: 5, done: true }, { w: 120, r: 5, done: true }],
        },
      ],
    }

    await act(async () => {
      root.render(<SessionMuscleDistribution workout={workout} />)
    })

    const initialRows = container.querySelectorAll('.smd-row')
    expect(initialRows.length).toBe(4)

    const toggleBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Show all'))
    expect(toggleBtn).toBeTruthy()
    expect(toggleBtn?.textContent).toContain('Show all (6)')
    expect(toggleBtn?.getAttribute('aria-expanded')).toBe('false')

    await act(async () => {
      toggleBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const expandedRows = container.querySelectorAll('.smd-row')
    expect(expandedRows.length).toBe(6)

    const collapseBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Show less'))
    expect(collapseBtn).toBeTruthy()
    expect(collapseBtn?.getAttribute('aria-expanded')).toBe('true')

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
            { w: 50, r: 10, done: true, phase: 'warmup' },
            { w: 100, r: 8, done: false },
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
          id: '0025',
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
    await act(async () => {
      await new Promise(r => setTimeout(r, 100))
    })

    expect(container.textContent).toContain('What you just trained')

    const dist = container.querySelector('.session-muscle-distribution')
    expect(dist).toBeTruthy()

    const rows = dist?.querySelectorAll('.smd-row')
    expect(rows?.length).toBe(3)
    expect(rows?.[0].textContent).toContain('Chest')

    await act(async () => {
      rows?.[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rows?.[0].classList.contains('selected')).toBe(true)

    await act(async () => {
      rows?.[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(rows?.[0].classList.contains('selected')).toBe(false)

    const chestButton = container.querySelector('.bodymap [role="button"][aria-label*="Chest"]')
    expect(chestButton?.getAttribute('aria-label')).toBe('Chest, 2.0 effective sets')
    const calvesButton = container.querySelector('.bodymap [role="button"][aria-label*="Calves"]')
    expect(calvesButton?.getAttribute('aria-label')).toBe('Calves, not trained')
  })
})

describe('FinishSummary records', () => {
  it('marks a new Record and a best estimated 1RM in the record colour, not the accent', async () => {
    const w = {
      id: 'w-records', d: '2026-03-01', start: 1000, end: 4000,
      entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }],
    }
    await act(async () => {
      root.render(<FinishSummary w={w} prs={['0025']} e1prs={[{ id: '0025', est: 112.5 }]} close={vi.fn()} />)
    })
    const lines = [...container.querySelectorAll('.finish-records > *')]
    expect(lines.map(l => l.textContent)).toEqual([
      expect.stringContaining('New record:'),
      expect.stringContaining('Best estimated 1RM:'),
    ])
    for (const line of lines) {
      expect(line.classList.contains('record')).toBe(true)
      expect(line.classList.contains('accent')).toBe(false)
    }
    expect([...container.querySelectorAll('.tile .l')].map(l => l.textContent)).toContain('Records')
    expect(container.textContent).not.toMatch(/\bPRs?\b/)
  })
})

describe('FinishSummary figures', () => {
  const longSession = { id: 'w-long', d: '2026-03-01', start: 0, end: (2 * 60 + 25) * 60000,
    entries: [{ id: '0025', sets: Array.from({ length: 19 }, () => ({ w: 140, r: 12, done: true })) }] }
  const layout = tooWide => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () { return this.classList.contains('v') ? 130 : 0 })
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function () {
      return this.classList.contains('v') && tooWide(this) && !this.closest('.finish-kpis.tight') ? 180 : 100
    })
  }
  const render = async () => { await act(async () => { root.render(<FinishSummary w={longSession} prs={[]} close={vi.fn()} />) }) }

  it('keeps the tiles two by two while every figure fits', async () => {
    layout(() => false)
    await render()
    expect(container.querySelector('.finish-kpis').classList.contains('tight')).toBe(false)
  })

  it('gives Duration and Volume the full width when a figure would not fit its half, so no figure breaks', async () => {
    layout(v => v.textContent.startsWith('31,920'))
    await render()
    expect(container.querySelector('.finish-kpis').classList.contains('tight')).toBe(true)
  })
})
