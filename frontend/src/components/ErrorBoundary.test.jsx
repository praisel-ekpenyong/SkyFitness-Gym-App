// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'

function Bomb() { throw new Error('draw failed') }

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
  useUI.setState({ sheets: [], toastMsg: '', timer: { left: 30, total: 30, endsAt: Date.now() + 30000 }, work: { left: 10, total: 10, endsAt: Date.now() + 10000, label: 'Hold' } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(location, 'reload').mockImplementation(() => {})
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
})

async function showCrash() {
  useStore.getState().update(s => { s.active = { id: 'active', name: 'Push', start: 1, cur: 0, entries: [] } })
  await act(async () => { root.render(<ErrorBoundary><Bomb /></ErrorBoundary>) })
}

/** The discard button, whatever step of the inline confirm it is showing. */
const discardButton = () => [...container.querySelectorAll('button')].find(b =>
  b.textContent === 'Discard the running workout' || b.textContent === 'Tap again to discard')

const tap = async () => {
  const button = discardButton()
  expect(button, 'the inline discard button is rendered').toBeTruthy()
  await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

describe('ErrorBoundary inline two-step discard', () => {
  it('first tap only relabels the button to Tap again to discard, without discarding or opening a sheet', async () => {
    await showCrash()
    expect(discardButton().textContent).toBe('Discard the running workout')
    await tap()
    expect(discardButton().textContent).toBe('Tap again to discard')
    expect(container.textContent).not.toContain('Discard the running workout')
    expect(useStore.getState().S.active).toBeTruthy()
    expect(useUI.getState().timer).toBeTruthy()
    expect(useUI.getState().work).toBeTruthy()
    expect(useUI.getState().sheets).toEqual([])
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('second tap discards the running workout, stops the timers and reloads', async () => {
    await showCrash()
    await tap()
    expect(useStore.getState().S.active).toBeTruthy()
    await tap()
    expect(useStore.getState().S.active).toBeNull()
    expect(useUI.getState().timer).toBeNull()
    expect(useUI.getState().work).toBeNull()
    expect(location.reload).toHaveBeenCalledOnce()
  })

  it('reloads when the discard command refuses because the workout is already gone', async () => {
    await showCrash()
    await tap()
    useStore.getState().update(s => { s.active = null })
    await tap()
    expect(location.reload).toHaveBeenCalledOnce()
  })
})
