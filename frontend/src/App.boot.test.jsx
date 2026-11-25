// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { useStore } from './store/useStore.js'

vi.mock('./platform/sound.js', () => ({
  beep: vi.fn(),
  vibrate: vi.fn(),
  playSetComplete: vi.fn(),
  playTimerWarning: vi.fn(),
  playTimerComplete: vi.fn(),
  playWorkoutComplete: vi.fn(),
}))
vi.mock('./platform/mobile.js', () => ({
  MOBILE: false,
  nativeLoad: vi.fn(async () => null),
  nativeSave: vi.fn(async () => {}),
  syncReminder: vi.fn(async () => true),
  shareExport: vi.fn(async () => {}),
}))
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('network disabled in tests')))
})

let root
let container

async function boot() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(React.createElement(App)) })
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  await act(async () => { await new Promise(r => setTimeout(r, 50)) })
}

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('boot lands straight in an empty Sky log', () => {
  it('mounts the main UI with no login screen, no seed and no server calls', async () => {
    await boot()

    expect(document.querySelector('#tabbar')).toBeTruthy()
    const text = document.body.textContent
    expect(text).toContain('Home')
    expect(text).toContain('Stats')

    expect(text).not.toContain('Sign in with passkey')
    expect(text).not.toContain('Continue without account')
    expect(text).not.toContain('Create new profile')

    expect(useStore.getState().S.workouts).toHaveLength(0)
    expect(useStore.getState().S.routines).toHaveLength(0)

    expect(fetch).not.toHaveBeenCalled()
  })

  it('paints the page in the Profile\'s theme and repaints when the lifter switches it', async () => {
    await boot()
    expect(document.documentElement.dataset.theme).toBe('dark')

    await act(async () => { useStore.getState().update(s => { s.theme = 'light' }) })
    expect(document.documentElement.dataset.theme).toBe('light')

    await act(async () => { useStore.getState().update(s => { s.theme = 'dark' }) })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
