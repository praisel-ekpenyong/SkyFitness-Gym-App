// @vitest-environment happy-dom
// Boot smoke test (ticket 03 — guest-only static boot): the app must land straight in the
// main UI with an empty profile. No login screen, no passkey/account UI, no seeded demo
// data, and nothing that talks to a backend.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { useStore } from './store/useStore.js'

vi.mock('./lib/sound.js', () => ({ beep: vi.fn(), vibrate: vi.fn() }))
// The native mirror is a Capacitor plugin behind the MOBILE flag; in tests it is simply absent.
vi.mock('./lib/mobile.js', () => ({
  MOBILE: false,
  nativeLoad: vi.fn(async () => null),
  nativeSave: vi.fn(async () => {}),
  syncReminder: vi.fn(async () => true),
  shareExport: vi.fn(async () => {}),
}))
// Any fetch that slips through fails the test: a static build has no backend to call.
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

    // main UI present: tab bar with its tabs, and the Home view
    expect(document.querySelector('#tabbar')).toBeTruthy()
    const text = document.body.textContent
    expect(text).toContain('Home')
    expect(text).toContain('Stats')

    // no login screen / account UI anywhere
    expect(text).not.toContain('Sign in with passkey')
    expect(text).not.toContain('Continue without account')
    expect(text).not.toContain('Create new profile')

    // empty state: no seeded example data anywhere in the profile
    expect(useStore.getState().S.workouts).toHaveLength(0)
    expect(useStore.getState().S.routines).toHaveLength(0)

    // no network requests were made
    expect(fetch).not.toHaveBeenCalled()
  })
})
