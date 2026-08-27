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

  it('shows rest-day copy when no routine is scheduled', async () => {
    useStore.getState().update(s => {
      s.routines = []
      s.week = {}
      s.dayPlan = {}
      s.workouts = []
      s.active = null
      s.bodyweight = []
    })

    await act(async () => { root.render(<Home />) })

    const meta = container.querySelector('.home-hero-meta')
    expect(meta.textContent).toContain('Time to recover & rebuild')
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
    expect(meta.textContent).toContain('Time to recover & rebuild')
  })
})
