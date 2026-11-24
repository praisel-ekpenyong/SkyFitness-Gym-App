// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'

vi.mock('../platform/mobile.js', () => ({ MOBILE: true, shareExport: vi.fn(), syncReminder: vi.fn(async () => true) }))
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

describe('Settings workout-day reminder on the native build', () => {
  it('is offered, with its time once switched on', async () => {
    useStore.getState().update(s => { s.reminder = { ...s.reminder, on: true } })
    await act(async () => { root.render(<Settings />) })

    const titles = [...container.querySelectorAll('.lrow-t')].map(el => el.textContent)
    expect(titles).toContain('Workout day reminder')
    expect(titles).toContain('Reminder time')
  })
})
