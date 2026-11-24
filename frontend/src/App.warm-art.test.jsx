// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { warmArt } from './platform/media-warm.js'

vi.mock('./platform/media-warm.js', async importOriginal => ({
  ...(await importOriginal()),
  warmArt: vi.fn(async () => {}),
}))
vi.mock('./platform/mobile.js', () => ({
  MOBILE: false,
  nativeLoad: vi.fn(async () => null),
  nativeSave: vi.fn(async () => {}),
  syncReminder: vi.fn(async () => true),
  shareExport: vi.fn(async () => {}),
}))

let idle
let root
let container

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in tests'))))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  idle = []
  window.requestIdleCallback = vi.fn(cb => idle.push(cb))
  window.cancelIdleCallback = vi.fn()
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  delete window.requestIdleCallback
  delete window.cancelIdleCallback
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// Runs every timer due in the next minute, so a timer fallback would fire, then
// waits for the media-warm import that a fired callback starts.
const settle = () => act(async () => {
  await vi.advanceTimersByTimeAsync(60_000)
  await vi.dynamicImportSettled()
})

describe('warming exercise art', () => {
  it('waits for the browser to be idle', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root.render(React.createElement(App)) })
    await settle()
    expect(warmArt).not.toHaveBeenCalled()

    await act(async () => { idle.splice(0).forEach(cb => cb()) })
    await settle()
    expect(warmArt).toHaveBeenCalled()
  })
})
