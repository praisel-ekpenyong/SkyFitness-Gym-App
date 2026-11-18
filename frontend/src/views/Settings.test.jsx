// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'
import { useStore, DEF } from '../store/useStore.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => true }))
vi.mock('../sheets.jsx', () => ({ loadStarterPlan: vi.fn(), loadHypertrophyPlan: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(), displayNameSheet: vi.fn(), sexSheet: vi.fn(), birthYearSheet: vi.fn() }))

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

describe('Settings screen-awake hint', () => {
  it('is the subtitle of the "Keep screen awake" row, not the section footer', async () => {
    await act(async () => { root.render(<Settings />) })

    const hint = 'The screen stays on while a workout is running, so you don’t have to unlock your phone between sets.'
    const row = [...container.querySelectorAll('.lrow')].find(r => r.querySelector('.lrow-t')?.textContent === 'Keep screen awake')
    expect(row.querySelector('.lrow-s')?.textContent).toBe(hint)
    expect([...container.querySelectorAll('.sect-f')].map(f => f.textContent)).not.toContain(hint)
  })
})
