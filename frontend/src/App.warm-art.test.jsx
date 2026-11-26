// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { useStore } from './store/useStore.js'

vi.mock('./platform/mobile.js', async orig => (await import('./test/platform-mocks.js')).mockMobile(await orig()))

let idle
let root
let container
let fetchStub
let onlineDescriptor
let serviceWorkerDescriptor

// Fixture exercise shipped in the catalogue; both media files are warmed, in this order.
const WARM_ID = '0001'
const ART_URLS = [
  'media/images/0001-2gPfomN.jpg',
  'media/videos/0001-2gPfomN.gif',
]

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  fetchStub = vi.fn(async () => ({}))
  vi.stubGlobal('fetch', fetchStub)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  idle = []
  window.requestIdleCallback = vi.fn(cb => idle.push(cb))
  window.cancelIdleCallback = vi.fn()
  // warmArt only fetches when the device is online and a service worker controls the page.
  onlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'onLine')
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true })
  serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'serviceWorker')
  Object.defineProperty(window.navigator, 'serviceWorker', { configurable: true, value: { controller: {} } })
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  delete window.requestIdleCallback
  delete window.cancelIdleCallback
  if (onlineDescriptor) Object.defineProperty(window.navigator, 'onLine', onlineDescriptor)
  else delete window.navigator.onLine
  if (serviceWorkerDescriptor) Object.defineProperty(window.navigator, 'serviceWorker', serviceWorkerDescriptor)
  else delete window.navigator.serviceWorker
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const settle = () => act(async () => {
  await vi.advanceTimersByTimeAsync(60_000)
  await vi.dynamicImportSettled()
})

describe('warming exercise art', () => {
  it('requests the planned exercise art only once the browser is idle', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => { root.render(React.createElement(App)) })
    await settle()

    // The real warming policy reads the store when the idle callback fires, not at boot.
    const S = useStore.getState().S
    const week = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(day => [day, 'push']))
    await act(async () => {
      useStore.setState({
        S: {
          ...S,
          routines: [{ id: 'push', name: 'Push', ex: [{ id: WARM_ID }] }],
          week,
          dayPlan: {},
          active: null,
        },
      })
    })

    expect(fetchStub).not.toHaveBeenCalled()

    await act(async () => { idle.splice(0).forEach(cb => cb()) })
    await settle()

    expect(fetchStub.mock.calls.map(([url]) => url)).toEqual(ART_URLS)
  })
})
