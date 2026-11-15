// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Home from './Home.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { todayISO } from '../lib/format.js'

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
    // exCount must be imported alongside fmtNum etc
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
    // ensure not pluralized incorrectly
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
      s.workouts = [{ d: today, name: 'Push', sets: [] }]
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const card = container.querySelector('button.card[aria-label="Weekly progress and calendar"]')
    expect(card).toBeTruthy()
    expect(card.textContent).toContain('1 of 2 workouts this week')
    expect(card.textContent).toContain('1 workout total')
    expect(card.textContent).toContain('View calendar')
    expect(card.textContent.toLowerCase()).not.toContain('streak')
    expect(container.textContent.toLowerCase()).not.toContain('week streak')
    // No flame icon path present
    expect(container.querySelector('svg.icn path[d*="M12 20.4c3.2 0 5.4-2.1"]')).toBeNull()
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

    expect(container.querySelector('.bw-card .delta-pill').textContent).toBe('\u22120.2 kg')
  })
})

describe('Home header', () => {
  // Sky has no accounts: the name is a greeting, edited in Settings. A chip beside it only
  // repeated the name and implied a profile switcher.
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

// A name breaks at spaces only. Widths below were measured in the built app (Archivo,
// display role, em per glyph) against the hero text column at 360 wide (148px beside the map, 296px
// across the card): a word that cannot fit beside the map at the 28px step moves the map below.
// `stacked` lists the layouts that stack (lib/name-fit.test.js covers tablet and desktop).
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
    // PUSH is 1.93em: 108px at 56px
    expect(await heroFor('Push Day')).toEqual({ step: 'poster', stacked: [], text: 'Push Day' })
  })

  it('steps a ten-letter word down to the 28px heading step before it would break', async () => {
    // HAMSTRINGS is 4.95em: 168px at 34px (too wide), 138px at 28px
    const fit = await heroFor('Hamstrings')
    expect(fit.step).toBe('xxs')
    expect(fit.stacked).not.toContain('phone')
  })

  it('moves the map below a word no step can fit beside it', async () => {
    // HYPERTROPHY is 5.49em: 154px even at 28px; across the card it fits at 44px (242px). A tablet's
    // 312px column holds it beside the map.
    expect(await heroFor('Upper Body Hypertrophy')).toEqual({ step: 's', stacked: ['phone', 'desktop'], text: 'Upper Body Hypertrophy' })
  })

  it('treats a hyphenated word as one word', async () => {
    // POSTERIOR-CHAIN is 6.83em: 300px at 44px is too wide for 296px; 232px at 34px
    expect(await heroFor('Posterior-chain Conditioning')).toMatchObject({ step: 'xs', stacked: ['phone', 'desktop'] })
  })
})
