// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Home from './Home.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { todayISO, isoOf } from '../lib/dates.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

let container
let root

function routineWithEx(count, extra = {}) {
  const ex = Array.from({ length: count }, (_, i) => ({
    id: `ex-${i}`,
    mode: 'reps',
    reps: 10,
    weight: 50,
    sets: 3,
    ...extra,
  }))
  return { id: 'r1', name: 'Push', emoji: 'pushup', ex }
}

function weekdayFromISO(iso) {
  return new Date(iso + 'T12:00:00').getDay()
}

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
  vi.restoreAllMocks()
})

describe('Home hero routine exercise count binding (05)', () => {
  it('source binds to routine.ex via exCount and not routine.exercises', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(resolve(here, 'Home.jsx'), 'utf8')
    expect(src).toContain('routine.ex?.length ? exCount(routine.ex.length)')
    expect(src).toContain("t(\"Today's routine\")")
    expect(src).not.toContain('routine.exercises')
    expect(src).toContain("from '../lib/format.js'")
    expect(src).toMatch(/import\s+\{[^}]*exCount[^}]*\}\s+from\s+['"]\.\.\/lib\/format\.js['"]/)
  })

  it('renders "4 exercises" for a scheduled routine with 4 items', async () => {
    const today = todayISO()
    const wd = weekdayFromISO(today)
    const routine = routineWithEx(4)
    useStore.getState().update(s => {
      s.routines = [routine]
      s.week = { [wd]: routine.id }
      s.dayPlan = {}
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const meta = container.querySelector('.home-hero-meta')
    expect(meta).toBeTruthy()
    expect(meta.textContent).toContain('4 exercises')
    expect(meta.textContent).not.toContain("Today's routine")
  })

  it('renders "1 exercise" singular for a routine with one item', async () => {
    const today = todayISO()
    const wd = weekdayFromISO(today)
    const routine = routineWithEx(1)
    useStore.getState().update(s => {
      s.routines = [routine]
      s.week = { [wd]: routine.id }
      s.dayPlan = {}
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const meta = container.querySelector('.home-hero-meta')
    expect(meta.textContent).toContain('1 exercise')
    expect(meta.textContent).not.toMatch(/1 exercises/)
  })

  it('falls back to "Today\'s routine" when routine.ex is empty', async () => {
    const today = todayISO()
    const wd = weekdayFromISO(today)
    const routine = routineWithEx(0)
    useStore.getState().update(s => {
      s.routines = [routine]
      s.week = { [wd]: routine.id }
      s.dayPlan = {}
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const meta = container.querySelector('.home-hero-meta')
    expect(meta.textContent).toContain("Today's routine")
    expect(meta.textContent).not.toMatch(/\d+ exercises?/)
  })

  it('opens a brand-new profile on the welcome instead of a rest day', async () => {
    useStore.getState().update(s => {
      s.routines = []
      s.week = {}
      s.dayPlan = {}
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    expect(container.textContent).toContain('Start with a plan')
    expect(container.textContent).toContain('Load starter plan')
    expect(container.querySelector('.home-hero-meta')).toBeNull()
  })

  it('shows rest-day copy when no routine is scheduled', async () => {
    useStore.getState().update(s => {
      s.routines = [routineWithEx(2)]
      s.week = {}
      s.dayPlan = {}
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const meta = container.querySelector('.home-hero-meta')
    expect(meta.textContent).toContain('Time to recover and rebuild')
    expect(meta.textContent).not.toMatch(/\d+ exercises?/)
    expect(meta.textContent).not.toContain("Today's routine")
  })

  it('does not throw when S.dayPlan is missing (defensive guard)', async () => {
    const today = todayISO()
    const wd = weekdayFromISO(today)
    const routine = routineWithEx(2)
    useStore.getState().update(s => {
      s.routines = [routine]
      s.week = { [wd]: routine.id }
      s.workouts = []
      s.active = null
      s.bodyweight = []
      delete s.dayPlan
    })

    await act(async () => { root.render(<Home />) })

    const meta = container.querySelector('.home-hero-meta')
    expect(meta.textContent).toContain('2 exercises')
  })

  it('respects dayPlan override to rest — hero shows rest copy even though week has a routine', async () => {
    const today = todayISO()
    const wd = weekdayFromISO(today)
    const routine = routineWithEx(3)
    useStore.getState().update(s => {
      s.routines = [routine]
      s.week = { [wd]: routine.id }
      s.dayPlan = { [today]: 'rest' }
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const meta = container.querySelector('.home-hero-meta')
    expect(meta.textContent).toContain('Time to recover and rebuild')
  })
})

describe('Home declarative weekly progress card (non-gamified PRODUCT.md voice)', () => {
  it('renders declarative progress without streaks or flame iconography', async () => {
    const today = todayISO()
    const wd = weekdayFromISO(today)
    const routine = routineWithEx(3)
    useStore.getState().update(s => {
      s.routines = [routine]
      s.week = { [wd]: routine.id, [(wd + 2) % 7]: routine.id }
      s.dayPlan = {}
      s.workouts = [{ d: today, name: 'Push', entries: [{ id: 'lift', sets: [{ done: true, w: 60, r: 5 }] }] }]
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const card = container.querySelector('button.card[aria-label="Weekly progress and calendar"]')
    expect(card).toBeTruthy()
    expect(card.textContent).toContain('1 of 2 workouts this week')
    expect(card.textContent).toContain('1 workout total')
    expect(card.textContent).toContain('View calendar')
    expect(card.textContent).toContain('1-week streak')
    expect(card.textContent.toLowerCase()).not.toContain('freeze')
    expect(container.querySelector('svg.icn path[d*="M12 20.4c3.2 0 5.4-2.1"]')).toBeNull()
  })

  it('shows the week streak as a plain line under the weekly count', async () => {
    const today = todayISO()
    const wd = weekdayFromISO(today)
    const routine = routineWithEx(3)
    const weeksAgo = n => {
      const d = new Date(today + 'T12:00:00')
      d.setDate(d.getDate() - 7 * n)
      return isoOf(d)
    }
    const workouts = [0, 1, 2, 3].map(n => ({
      id: `w-${n}`, d: weeksAgo(n), name: 'Push', entries: [{ id: 'lift', sets: [{ done: true, w: 60, r: 5 }] }],
    }))
    useStore.getState().update(s => {
      s.routines = [routine]
      s.week = { [wd]: routine.id }
      s.dayPlan = {}
      s.workouts = workouts
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const card = container.querySelector('button.card[aria-label="Weekly progress and calendar"]')
    expect(card.querySelector('.wp-t').textContent).toBe('1 of 1 workouts this week')
    expect(card.querySelector('.wp-streak').textContent.trim()).toBe('4-week streak')
  })

  it('a re-render after the week ends shows the new week\'s streak, not last week\'s', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 5, 28, 20))
      useStore.getState().update(s => {
        s.workouts = [{ id: 'w1', d: '2026-06-15', name: 'Push', entries: [{ id: 'lift', sets: [{ done: true, w: 60, r: 5 }] }] }]
      })
      await act(async () => { root.render(<Home />) })
      expect(container.querySelector('.wp-streak').textContent.trim()).toBe('1-week streak')

      vi.setSystemTime(new Date(2026, 5, 29, 9))
      await act(async () => { container.querySelector('button[aria-label="Next week"]').click() })
      expect(container.querySelector('.wp-streak')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders factual text when no routine is scheduled for the week', async () => {
    useStore.getState().update(s => {
      s.routines = []
      s.week = {}
      s.dayPlan = {}
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const card = container.querySelector('button.card[aria-label="Weekly progress and calendar"]')
    expect(card).toBeTruthy()
    expect(card.textContent).toContain('No workouts this week')
    expect(card.textContent).toContain('0 workouts total')
    expect(card.textContent.toLowerCase()).not.toContain('streak')
  })

  it('writes the weight delta as a signed figure with the U+2212 minus', async () => {
    useStore.getState().update(s => {
      s.routines = []
      s.week = {}
      s.workouts = []
      s.active = null
      s.bodyweight = [{ d: '2026-11-01', w: 83, t: 1 }, { d: '2026-11-07', w: 82.8, t: 2 }]
    })

    await act(async () => { root.render(<Home />) })

    expect(container.querySelector('.bw-card .delta-pill').textContent).toBe('\u22120.2\u00a0kg')
  })
})

describe('Home header', () => {
  it('says the name once and keeps only the settings key', async () => {
    useStore.getState().update(s => { s.displayName = 'Sam'; s.routines = []; s.workouts = []; s.active = null })

    await act(async () => { root.render(<Home />) })

    const hdr = container.querySelector('.home-hdr')
    expect(hdr.querySelector('h1').textContent).toBe('Hi Sam')
    expect(hdr.textContent.match(/Sam/g)).toHaveLength(1)
    expect(container.querySelector('.profile-pill')).toBeNull()
    expect(container.querySelector('button[aria-label="Edit name"]')).toBeNull()
    expect([...hdr.querySelectorAll('button')].map(b => b.getAttribute('aria-label'))).toEqual(['Settings'])
  })

  it('offers no name chip before a name is set either', async () => {
    useStore.getState().update(s => { s.displayName = ''; s.routines = []; s.workouts = []; s.active = null })

    await act(async () => { root.render(<Home />) })

    expect(container.querySelector('.home-hdr h1').textContent).toBe('Hi there')
    expect(container.querySelector('button[aria-label="Set name"]')).toBeNull()
  })
})

describe('Home hero long Routine names', () => {
  async function heroFor(name) {
    const wd = weekdayFromISO(todayISO())
    const routine = { ...routineWithEx(3), name }
    useStore.getState().update(s => {
      s.routines = [routine]
      s.week = { [wd]: routine.id }
      s.dayPlan = {}
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })
    await act(async () => { root.render(<Home />) })
    const title = container.querySelector('.home-hero-title')
    const step = ['xxs', 'xs', 's'].find(c => title.classList.contains(c)) || 'poster'
    const stacked = [...container.querySelector('.home-hero-body').classList].filter(c => c.startsWith('name-stacked-')).map(c => c.slice('name-stacked-'.length))
    return { step, stacked, text: title.textContent }
  }

  it('keeps "Push Day" on the poster step beside the map', async () => {
    expect(await heroFor('Push Day')).toEqual({ step: 'poster', stacked: [], text: 'Push Day' })
  })

  it('steps a ten-letter word down to the 28px heading step before it would break', async () => {
    const fit = await heroFor('Hamstrings')
    expect(fit.step).toBe('xxs')
    expect(fit.stacked).not.toContain('phone')
  })

  it('moves the map below a word no step can fit beside it', async () => {
    expect(await heroFor('Upper Body Hypertrophy')).toEqual({ step: 's', stacked: ['phone', 'desktop'], text: 'Upper Body Hypertrophy' })
  })

  it('treats a hyphenated word as one word', async () => {
    expect(await heroFor('Posterior-chain Conditioning')).toMatchObject({ step: 'xs', stacked: ['phone', 'desktop'] })
  })
})
