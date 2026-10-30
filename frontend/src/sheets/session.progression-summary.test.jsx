// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FinishSummary, finishWorkout, configureSessionSheets } from './session.jsx'
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
      routines: [
        {
          id: 'routine-push',
          name: 'Push Day',
          ex: [
            { id: '0025', sets: 3, reps: 5, weight: 60, prog: 'linear' },
            { id: '0047', sets: 3, reps: 12, repsMin: 8, weight: 24, prog: 'double' },
          ],
        },
      ],
      workouts: [],
      exWeights: {},
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

describe('FinishSummary Progression Summary', () => {
  it('renders dedicated Progression section between PRs and BodyMap when trained exercises exist', async () => {
    const w = {
      id: 'w-1',
      d: '2026-10-30',
      start: 1000,
      end: 2000,
      routineId: 'routine-push',
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
          sets: [
            { w: 60, r: 5, done: true },
            { w: 60, r: 5, done: true },
            { w: 60, r: 5, done: true },
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={['0025']} close={vi.fn()} />)
    })

    const card = container.querySelector('.progression-summary')
    expect(card).not.toBeNull()
    expect(card.getAttribute('aria-label')).toBe('Progression summary')

    // Verify section header "Progression"
    expect(container.textContent).toContain('Progression')

    // Document order check: PRs precede Progression section, and Progression section precedes BodyMap
    const prSection = container.querySelector('.accent.row')
    const bodyMap = container.querySelector('svg.bodymap, [aria-label*="muscle"], .bodymap')
    expect(prSection).not.toBeNull()
    expect(prSection.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    if (bodyMap) {
      expect(card.compareDocumentPosition(bodyMap) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('excludes exercises with zero performed work sets from the progression summary', async () => {
    const w = {
      id: 'w-1',
      d: '2026-10-30',
      start: 1000,
      end: 2000,
      routineId: 'routine-push',
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
          sets: [
            { w: 60, r: 5, done: true },
          ],
        },
        {
          id: '0047',
          target: { sets: 3, reps: 12, repsMin: 8, weight: 24, prog: 'double' },
          sets: [
            { w: 24, r: 10, done: false }, // unticked / skipped
            { w: 24, r: 10, done: false },
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={[]} close={vi.fn()} />)
    })

    const card = container.querySelector('.progression-summary')
    expect(card).not.toBeNull()
    expect(card.textContent.toLowerCase()).toContain('barbell bench press')
    expect(card.textContent.toLowerCase()).not.toContain('barbell incline bench press')
  })

  it('omits the progression summary section entirely when no exercises have performed work sets', async () => {
    const w = {
      id: 'w-1',
      d: '2026-10-30',
      start: 1000,
      end: 2000,
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 5, weight: 60 },
          sets: [
            { w: 60, r: 5, done: false },
            { w: 60, r: 5, done: false },
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={[]} close={vi.fn()} />)
    })

    expect(container.querySelector('.progression-summary')).toBeNull()
    expect(container.querySelector('.sec')?.textContent).not.toBe('Progression')
  })

  it('highlights load increases (kind === up) with old and new working loads and advance indicator', async () => {
    const w = {
      id: 'w-1',
      d: '2026-10-30',
      start: 1000,
      end: 2000,
      routineId: 'routine-push',
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
          sets: [
            { w: 60, r: 5, done: true },
            { w: 60, r: 5, done: true },
            { w: 60, r: 5, done: true },
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={[]} close={vi.fn()} />)
    })

    const card = container.querySelector('.progression-summary')
    expect(card).not.toBeNull()
    expect(card.textContent.toLowerCase()).toContain('barbell bench press')
    expect(card.textContent).toContain('Linear progression')
    expect(card.textContent).toContain('60 kg → 62.5 kg (+2.5 kg)')

    // Advance indicator arrow
    const arrow = card.querySelector('svg')
    expect(arrow).not.toBeNull()

    // Accessible item label
    const item = card.querySelector('[role="listitem"]')
    expect(item).not.toBeNull()
    expect(item.getAttribute('aria-label')).toContain('60 kg → 62.5 kg (+2.5 kg)')
  })

  it('displays next target rep aim for double progression rep climb', async () => {
    const w = {
      id: 'w-1',
      d: '2026-10-30',
      start: 1000,
      end: 2000,
      routineId: 'routine-push',
      entries: [
        {
          id: '0047',
          target: { sets: 3, reps: 12, repsMin: 8, weight: 24, prog: 'double' },
          sets: [
            { w: 24, r: 9, done: true },
            { w: 24, r: 9, done: true },
            { w: 24, r: 9, done: true },
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={[]} close={vi.fn()} />)
    })

    const card = container.querySelector('.progression-summary')
    expect(card).not.toBeNull()
    expect(card.textContent.toLowerCase()).toContain('barbell incline bench press')
    expect(card.textContent).toContain('Double progression')
    expect(card.textContent).toContain('Aim for 10 reps at 24 kg')
  })

  it('displays constructive coaching context on deload without punitive failure language', async () => {
    // 2 prior misses in history at 100 kg
    const priorWorkouts = [
      {
        id: 'w-prev-1',
        d: '2026-10-20',
        entries: [
          {
            id: '0025',
            target: { sets: 3, reps: 5, weight: 100, prog: 'linear' },
            sets: [{ w: 100, r: 3, done: true }],
          },
        ],
      },
      {
        id: 'w-prev-2',
        d: '2026-10-25',
        entries: [
          {
            id: '0025',
            target: { sets: 3, reps: 5, weight: 100, prog: 'linear' },
            sets: [{ w: 100, r: 3, done: true }],
          },
        ],
      },
    ]

    useStore.setState({
      S: {
        ...useStore.getState().S,
        workouts: priorWorkouts,
      },
    })

    // 3rd miss triggers deload
    const w = {
      id: 'w-current',
      d: '2026-10-30',
      start: 1000,
      end: 2000,
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 5, weight: 100, prog: 'linear' },
          sets: [{ w: 100, r: 3, done: true }],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={[]} close={vi.fn()} />)
    })

    const card = container.querySelector('.progression-summary')
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('Deload 10% to reset and rebuild')

    // No punitive failure language
    expect(card.textContent.toLowerCase()).not.toContain('failed')
    expect(card.textContent.toLowerCase()).not.toContain('failure')
    expect(card.textContent.toLowerCase()).not.toContain('penalty')
  })

  it('displays constructive volume consolidation context on hold', async () => {
    const w = {
      id: 'w-1',
      d: '2026-10-30',
      start: 1000,
      end: 2000,
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
          sets: [
            { w: 60, r: 4, done: true }, // missed 5 reps, 1st stall -> hold
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={[]} close={vi.fn()} />)
    })

    const card = container.querySelector('.progression-summary')
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('Hold at 60 kg to solidify volume')
  })

  it('renders multiple trained exercises with clean accessible labels and badges', async () => {
    const w = {
      id: 'w-1',
      d: '2026-10-30',
      start: 1000,
      end: 2000,
      routineId: 'routine-push',
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
          sets: [
            { w: 60, r: 5, done: true },
            { w: 60, r: 5, done: true },
            { w: 60, r: 5, done: true },
          ],
        },
        {
          id: '0047',
          target: { sets: 3, reps: 12, repsMin: 8, weight: 24, prog: 'double' },
          sets: [
            { w: 24, r: 9, done: true },
            { w: 24, r: 9, done: true },
            { w: 24, r: 9, done: true },
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={[]} close={vi.fn()} />)
    })

    const items = container.querySelectorAll('.progression-summary [role="listitem"]')
    expect(items.length).toBe(2)

    expect(items[0].getAttribute('aria-label').toLowerCase()).toContain('barbell bench press')
    expect(items[0].textContent).toContain('60 kg → 62.5 kg (+2.5 kg)')

    expect(items[1].getAttribute('aria-label').toLowerCase()).toContain('barbell incline bench press')
    expect(items[1].textContent).toContain('Aim for 10 reps at 24 kg')
  })

  it('highlights Greyskull LP double weight increment on doubling AMRAP target reps', async () => {
    const w = {
      id: 'w-1',
      d: '2026-10-30',
      start: 1000,
      end: 2000,
      entries: [
        {
          id: '0025',
          target: { sets: 3, reps: 5, weight: 60, prog: 'greyskull' },
          sets: [
            { w: 60, r: 5, done: true },
            { w: 60, r: 5, done: true },
            { w: 60, r: 10, done: true }, // Doubled target (10 reps on final AMRAP set)
          ],
        },
      ],
    }

    await act(async () => {
      root.render(<FinishSummary w={w} prs={[]} close={vi.fn()} />)
    })

    const card = container.querySelector('.progression-summary')
    expect(card).not.toBeNull()
    expect(card.textContent.toLowerCase()).toContain('barbell bench press')
    expect(card.textContent).toContain('Greyskull LP')
    // Double increment: 2.5 * 2 = 5 kg
    expect(card.textContent).toContain('60 kg → 65 kg (+5 kg)')
  })

  it('integrates with finishWorkout() lifecycle and surfaces progression summary in opened sheet', async () => {
    useStore.setState({
      S: {
        ...useStore.getState().S,
        active: {
          id: 'active-1',
          d: '2026-10-30',
          start: 1000,
          routineId: 'routine-push',
          name: 'Push Day',
          bw: null,
          unit: 'kg',
          cur: 0,
          entries: [
            {
              id: '0025',
              sets: [
                { w: 60, r: 5, done: true },
                { w: 60, r: 5, done: true },
                { w: 60, r: 5, done: true },
              ],
              target: { sets: 3, reps: 5, weight: 60, prog: 'linear' },
            },
          ],
        },
      },
    })

    await act(async () => {
      finishWorkout()
    })

    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)

    const closeSheet = vi.fn()
    await act(async () => {
      root.render(sheets[0].render(closeSheet))
    })

    const card = container.querySelector('.progression-summary')
    expect(card).not.toBeNull()
    expect(card.textContent.toLowerCase()).toContain('barbell bench press')
    expect(card.textContent).toContain('Linear progression')
    expect(card.textContent).toContain('60 kg → 62.5 kg (+2.5 kg)')
  })
})
