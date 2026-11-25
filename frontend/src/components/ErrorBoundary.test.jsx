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

describe('ErrorBoundary discard', () => {
  it('keeps the running workout until the confirm, then discards, stops the timers and reloads', async () => {
    await showCrash()
    const discard = [...container.querySelectorAll('button')].find(b => b.textContent === 'Discard the running workout')
    await act(async () => { discard.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(useStore.getState().S.active).toBeTruthy()
    expect(location.reload).not.toHaveBeenCalled()

    const sheet = useUI.getState().sheets.at(-1)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const confirmRoot = createRoot(host)
    await act(async () => { confirmRoot.render(sheet.render(() => {})) })
    expect(host.textContent).toContain('Discard workout?')
    expect(host.textContent).toContain('The sets you logged in this session will be lost.')

    const cancel = [...host.querySelectorAll('button')].find(b => b.textContent === 'Cancel')
    await act(async () => { cancel.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(useStore.getState().S.active).toBeTruthy()
    expect(location.reload).not.toHaveBeenCalled()

    const ok = [...host.querySelectorAll('button')].find(b => b.textContent === 'Discard')
    await act(async () => { ok.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(useStore.getState().S.active).toBeNull()
    expect(useUI.getState().timer).toBeNull()
    expect(useUI.getState().work).toBeNull()
    expect(location.reload).toHaveBeenCalledOnce()
    await act(async () => { confirmRoot.unmount() })
    host.remove()
  })

  it('reloads when the discard command refuses because the workout is already gone', async () => {
    await showCrash()
    const discard = [...container.querySelectorAll('button')].find(b => b.textContent === 'Discard the running workout')
    await act(async () => { discard.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    useStore.getState().update(s => { s.active = null })

    const sheet = useUI.getState().sheets.at(-1)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const confirmRoot = createRoot(host)
    await act(async () => { confirmRoot.render(sheet.render(() => {})) })
    const ok = [...host.querySelectorAll('button')].find(b => b.textContent === 'Discard')
    await act(async () => { ok.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(location.reload).toHaveBeenCalledOnce()
    await act(async () => { confirmRoot.unmount() })
    host.remove()
  })
})
