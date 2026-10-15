// @vitest-environment happy-dom
// Offline badge (ticket 07): a tiny local-serving indicator — hidden while online,
// a status badge while the shell is served locally.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import OfflineBadge from './OfflineBadge.jsx'

let container
let root

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  setOnline(true)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  setOnline(true)
})

async function renderBadge() {
  await act(async () => { root.render(<OfflineBadge />) })
}

describe('OfflineBadge', () => {
  it('stays hidden while online', async () => {
    await renderBadge()
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('shows a local-serving badge while offline', async () => {
    setOnline(false)
    await renderBadge()
    const badge = container.querySelector('[role="status"]')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toMatch(/serving locally/i)
  })

  it('appears and disappears with offline and online events', async () => {
    await renderBadge()
    expect(container.querySelector('[role="status"]')).toBeNull()

    await act(async () => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(container.querySelector('[role="status"]')).toBeTruthy()

    await act(async () => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(container.querySelector('[role="status"]')).toBeNull()
  })
})
