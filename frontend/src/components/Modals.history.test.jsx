// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { screen } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Modals from './Modals.jsx'
import { useUI } from '../store/useUI.js'
import { createBrowserHistoryAdapter } from '../platform/browser-history.js'

// The Interface test crosses the attach seam: the host injects a store-backed sheets
// Adapter, the browser-history Adapter over happy-dom's real history, and a hardware
// Back Adapter whose installed handle this test can fire. The browser's own history
// stack stands in for Back: an open sheet owns one entry. Each test starts on
// "workout", one entry ahead of "home", and checks where the lifter ends up.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let backHandle

const sheet = (id, { locked = false } = {}) => ({ id, locked, label: id, kind: 'sheet', render: () => <div /> })
const setSheets = sheets => act(async () => { useUI.setState({ sheets }) })
const ids = () => useUI.getState().sheets.map(s => s.id)
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
const back = async () => { history.back(); await settle() }
const hardwareBack = async () => { const consumed = backHandle(); await settle(); return consumed }
const page = () => history.state?.page ?? (history.state?.skySheet ? 'sheet' : null)

const host = {
  sheets: {
    subscribe: handler => useUI.subscribe((state, prev) => {
      if (state.sheets !== prev.sheets) handler(state.sheets)
    }),
    getSheets: () => useUI.getState().sheets,
    closeSheet: id => useUI.getState().closeSheet(id),
  },
  history: createBrowserHistoryAdapter({ history: window.history, location: window.location, win: window }),
  back: {
    install: handle => {
      backHandle = handle
      return () => { if (backHandle === handle) backHandle = null }
    },
  },
}

beforeEach(async () => {
  history.pushState({ page: 'home' }, '', '#/home')
  history.pushState({ page: 'workout' }, '', '#/workout')
  useUI.setState({ sheets: [] })
  backHandle = null
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<Modals host={host} />) })
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
})

describe('Back with sheets open', () => {
  it('closes the sheet and stays on the page', async () => {
    await setSheets([sheet('goal')])
    await back()
    expect(ids()).toEqual([])
    expect(page()).toBe('workout')
    expect(location.hash).toBe('#/workout')
  })

  it('closes stacked sheets one Back at a time, then stays on the page', async () => {
    await setSheets([sheet('one'), sheet('two')])
    await back()
    expect(ids()).toEqual(['one'])
    await back()
    expect(ids()).toEqual([])
    expect(page()).toBe('workout')
  })

  it('closes the visible top sheet before skipping a lower-sheet tombstone', async () => {
    await setSheets([sheet('lower'), sheet('upper')])
    await act(async () => { useUI.getState().closeSheet('lower') })
    expect(ids()).toEqual(['upper'])
    expect(screen.queryByRole('dialog', { name: 'lower' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'upper' })).toBeTruthy()

    await back()
    expect(ids()).toEqual([])
    expect(screen.queryByRole('dialog', { name: 'upper' })).toBeNull()
    expect(page()).toBe('workout')
    await back()
    expect(page()).toBe('home')
  })

  it('does not close a locked sheet, and does not take the lifter off the page when it is closed later', async () => {
    await setSheets([sheet('confirm')])
    await setSheets([sheet('summary', { locked: true })])
    await back()
    expect(ids()).toEqual(['summary'])

    await act(async () => { useUI.getState().closeSheet('summary') })
    await settle()
    expect(page()).toBe('workout')
    await back()
    expect(page()).toBe('home')
  })
})

describe('closing sheets from the screen', () => {
  it('leaves the page where it was, so the next Back leaves the app as before', async () => {
    await setSheets([sheet('goal')])
    expect(page()).toBe('sheet')
    await setSheets([])
    await settle()
    expect(page()).toBe('workout')
  })

  it('removes every entry of sheets opened and closed together', async () => {
    await setSheets([sheet('one'), sheet('two')])
    await setSheets([])
    await settle()
    expect(page()).toBe('workout')
  })

  it('does not treat an explicit-close rewind as Back for a later sheet', async () => {
    await setSheets([sheet('first')])
    await setSheets([])
    await settle()

    await setSheets([sheet('second')])
    await back()
    expect(ids()).toEqual([])
    expect(page()).toBe('workout')
  })

  it('drains a lower tombstone when the remaining top sheet is explicitly closed', async () => {
    await setSheets([sheet('lower'), sheet('upper')])
    await act(async () => { useUI.getState().closeSheet('lower') })
    await act(async () => { useUI.getState().closeSheet('upper') })
    await settle()

    expect(ids()).toEqual([])
    expect(screen.queryByRole('dialog', { name: 'upper' })).toBeNull()
    expect(page()).toBe('workout')
    await back()
    expect(page()).toBe('home')
  })

  it('skips multiple lower tombstones in order when the top sheet closes on Back', async () => {
    await setSheets([sheet('first'), sheet('second'), sheet('top')])
    await act(async () => { useUI.getState().closeSheet('first') })
    await act(async () => { useUI.getState().closeSheet('second') })
    expect(ids()).toEqual(['top'])

    await back()
    expect(ids()).toEqual([])
    expect(screen.queryByRole('dialog', { name: 'top' })).toBeNull()
    expect(page()).toBe('workout')
    await back()
    expect(page()).toBe('home')
  })

  it('does not pull the lifter back when the app has already moved to another page', async () => {
    await setSheets([sheet('navigating')])
    history.pushState({ page: 'plan' }, '', '#/plan')
    await setSheets([])
    await settle()
    expect(page()).toBe('plan')
    expect(location.hash).toBe('#/plan')
  })
})

describe('hardware Back through the installed handle', () => {
  it('closes the top sheet, leaves history aligned and reports that it consumed the press', async () => {
    await setSheets([sheet('goal')])
    expect(await hardwareBack()).toBe(true)
    expect(ids()).toEqual([])
    expect(page()).toBe('workout')
    expect(location.hash).toBe('#/workout')
  })

  it('a locked sheet consumes the press without closing or leaving the page', async () => {
    await setSheets([sheet('confirm', { locked: true })])
    expect(await hardwareBack()).toBe(true)
    expect(ids()).toEqual(['confirm'])
    expect(page()).toBe('workout')
  })

  it('reports an unconsumed press when no sheet is open', async () => {
    expect(await hardwareBack()).toBe(false)
    expect(page()).toBe('workout')
  })
})
