// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../platform/wakelock.js', () => ({ wakeLockSupported: () => true }))
vi.mock('../sheets/plan-tools.jsx', () => ({ loadStarterPlan: vi.fn(), loadHypertrophyPlan: vi.fn() }))
vi.mock('../sheets/confirm.jsx', () => ({ confirmSheet: vi.fn() }))
vi.mock('../sheets/import.jsx', () => ({ importFromApp: vi.fn() }))
vi.mock('../sheets/profile.jsx', () => ({ displayNameSheet: vi.fn(), sexSheet: vi.fn(), birthYearSheet: vi.fn() }))

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
  container?.remove()
  root = null
  container = null
})

describe('Settings workout-day reminder', () => {
  it('is not offered on the web build, which cannot schedule a notification for later', async () => {
    useStore.getState().update(s => { s.reminder = { ...s.reminder, on: true } })
    await act(async () => { root.render(<Settings />) })

    const titles = [...container.querySelectorAll('.lrow-t')].map(el => el.textContent)
    expect(titles).not.toContain('Workout day reminder')
    expect(titles).not.toContain('Reminder time')
  })
})

describe('Settings screen-awake hint', () => {
  it('is the subtitle of the "Keep screen awake" row, not the section footer', async () => {
    await act(async () => { root.render(<Settings />) })

    const hint = 'The screen stays on while a workout is running, so you don’t have to unlock your phone between sets.'
    const row = [...container.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === 'Keep screen awake')
    expect(row.querySelector('.lrow-s')?.textContent).toBe(hint)
    expect([...container.querySelectorAll('.sect-f')].map(f => f.textContent)).not.toContain(hint)
  })
})

describe('Settings weight unit (ADR 0031)', () => {
  const pick = unit => [...container.querySelectorAll('[role="radiogroup"][aria-label="Weight unit"] button')].find(b => b.textContent === unit)

  it('converts Routines and the Goal weight, and says so', async () => {
    useStore.getState().update(s => {
      s.targetW = 75
      s.routines = [{ id: 'r', name: 'Push', ex: [{ id: 'bench', sets: 3, reps: 5, weight: 60 }] }]
    })
    await act(async () => { root.render(<Settings />) })
    await act(async () => { pick('lb').click() })

    const S = useStore.getState().S
    expect(S.unit).toBe('lb')
    expect(S.targetW).toBe(165.3)
    expect(S.routines[0].ex[0].weight).toBe(132.3)
    const footers = [...container.querySelectorAll('.sect-f')].map(f => f.textContent)
    expect(footers).toContain('Switching converts your routines and goal weight. Logged workouts and weigh-ins keep what you entered and show in the new unit.')
  })

  it('refuses to switch during a workout and says why', async () => {
    useStore.getState().update(s => { s.active = { id: 'a', d: '2026-11-18', unit: 'kg', cur: 0, entries: [] } })
    useUI.setState({ toastMsg: '' })
    await act(async () => { root.render(<Settings />) })
    await act(async () => { pick('lb').click() })

    expect(useStore.getState().S.unit).toBe('kg')
    expect(useUI.getState().toastMsg).toBe('Finish or discard the workout in progress to switch units.')
  })
})
