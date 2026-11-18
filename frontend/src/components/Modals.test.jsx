import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Modals from './Modals.jsx'

const mocks = vi.hoisted(() => {
  const listeners = new Set()
  const state = {
    sheets: [],
    closeSheet(id) {
      state.sheets = state.sheets.filter(sheet => sheet.id !== id)
      listeners.forEach(listener => listener())
    },
  }
  return {
    state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setSheets(sheets) {
      state.sheets = sheets
      listeners.forEach(listener => listener())
    },
  }
})

vi.mock('../store/useUI.js', async () => {
  const React = await import('react')
  const useUI = (selector = state => state) => React.useSyncExternalStore(
    mocks.subscribe,
    () => selector(mocks.state),
    () => selector(mocks.state),
  )
  useUI.getState = () => mocks.state
  return { useUI }
})

let dom
let root
let container
let historyMock
let locationMock

function sheet(id, { locked = false, label = 'Test sheet', render = () => React.createElement('div') } = {}) {
  return { id, locked, label, kind: 'sheet', render }
}

function installDom() {
  const parsed = parseHTML('<!doctype html><html><body><div id="root"></div></body></html>')
  dom = parsed.window
  dom.scrollTo = vi.fn()
  globalThis.window = dom
  globalThis.document = dom.document
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.navigator })
  for (const key of ['HTMLElement', 'Node', 'Element', 'Event', 'MutationObserver']) globalThis[key] = dom[key]
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  locationMock = { href: 'https://sky.test/#/workout' }
  historyMock = { pushState: vi.fn(), go: vi.fn() }
  Object.defineProperty(globalThis, 'location', { configurable: true, value: locationMock })
  Object.defineProperty(globalThis, 'history', { configurable: true, value: historyMock })

  container = document.getElementById('root')
  root = createRoot(container)
}

async function setSheets(sheets) {
  await act(async () => { mocks.setSheets(sheets) })
}

async function popstate() {
  await act(async () => { window.dispatchEvent(new dom.Event('popstate')) })
}

function mouse(target, type, clientY) {
  const event = new dom.Event(type, { bubbles: true })
  Object.defineProperties(event, {
    button: { value: 0 },
    clientY: { value: clientY },
  })
  target.dispatchEvent(event)
}

beforeEach(async () => {
  mocks.state.sheets = []
  installDom()
  await act(async () => { root.render(React.createElement(Modals)) })
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  root = null
  container = null
  dom = null
  vi.restoreAllMocks()
})

describe('Modals sheet history accounting', () => {
  it('does not rewind a real page after back spends a locked FinishSummary entry', async () => {
    const confirm = sheet('confirm')
    const summary = sheet('summary', { locked: true })

    await setSheets([confirm])
    expect(historyMock.pushState).toHaveBeenCalledTimes(1)

    await setSheets([summary])
    await popstate()
    expect(mocks.state.sheets).toEqual([summary])

    await act(async () => { mocks.state.closeSheet('summary') })
    expect(historyMock.go).not.toHaveBeenCalled()
  })

  it('pushes and rewinds the exact number of entries for batched sheets', async () => {
    await setSheets([sheet('one'), sheet('two')])
    expect(historyMock.pushState).toHaveBeenCalledTimes(2)

    await setSheets([])
    expect(historyMock.go).toHaveBeenCalledTimes(1)
    expect(historyMock.go).toHaveBeenCalledWith(-2)
  })

  it('closes stacked sheets one entry at a time on back', async () => {
    await setSheets([sheet('one'), sheet('two')])
    await popstate()

    expect(mocks.state.sheets.map(item => item.id)).toEqual(['one'])
    expect(historyMock.pushState).toHaveBeenCalledTimes(2)

    await popstate()
    expect(mocks.state.sheets).toEqual([])
    expect(historyMock.go).not.toHaveBeenCalled()
  })

  it('closes an unlocked sheet on back without rewinding its already-spent entry', async () => {
    await setSheets([sheet('open')])
    await popstate()

    expect(mocks.state.sheets).toEqual([])
    expect(historyMock.go).not.toHaveBeenCalled()
  })

  it('accounts for a moved-on entry even when popstate has no current sheet', async () => {
    await setSheets([sheet('navigating')])
    locationMock.href = 'https://sky.test/#/home'
    await setSheets([])
    expect(historyMock.go).not.toHaveBeenCalled()

    await popstate()

    const locked = sheet('locked', { locked: true })
    await setSheets([locked])
    await popstate()
    await setSheets([])
    expect(historyMock.go).not.toHaveBeenCalled()
  })
})

describe('Modals mouse dragging', () => {
  it('leaves range sliders opted out of sheet dragging', async () => {
    await setSheets([sheet('slider', {
      render: () => React.createElement('input', { type: 'range' }),
    })])
    const sheetEl = container.querySelector('.sheet')
    const slider = container.querySelector('input[type="range"]')
    sheetEl.scrollTop = 0

    await act(async () => {
      mouse(slider, 'mousedown', 10)
      mouse(sheetEl, 'mousemove', 150)
      window.dispatchEvent(new dom.Event('mouseup'))
    })

    expect(sheetEl.style.transform).toBe('')
    expect(mocks.state.sheets).toHaveLength(1)
  })

  it('releases a drag when mouseup occurs outside the sheet', async () => {
    await setSheets([sheet('drag')])
    const sheetEl = container.querySelector('.sheet')
    sheetEl.scrollTop = 0

    await act(async () => {
      mouse(sheetEl, 'mousedown', 10)
      mouse(sheetEl, 'mousemove', 60)
    })
    expect(sheetEl.style.transform).toBe('translateY(50px)')

    await act(async () => { window.dispatchEvent(new dom.Event('mouseup')) })
    expect(sheetEl.style.transform).toBe('')

    await act(async () => { mouse(sheetEl, 'mousemove', 120) })
    expect(sheetEl.style.transform).toBe('')
    expect(mocks.state.sheets).toHaveLength(1)
  })
})

describe('Modals dialog labelling', () => {
  const h = React.createElement

  it('names a dialog by its first heading', async () => {
    await setSheets([sheet('titled', {
      label: null,
      render: () => h('div', null, h('h3', null, 'Goal weight'), h('h3', null, 'Second')),
    })])
    const dialog = container.querySelector('[role="dialog"]')
    const id = dialog.getAttribute('aria-labelledby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id).textContent).toBe('Goal weight')
  })

  it('names a dialog with no heading by the label it was opened with', async () => {
    await setSheets([sheet('labelled', { label: 'Pick a colour' })])
    const dialog = container.querySelector('[role="dialog"]')
    expect(dialog.getAttribute('aria-label')).toBe('Pick a colour')
    expect(dialog.hasAttribute('aria-labelledby')).toBe(false)
  })

  it('fails loudly on a dialog with neither a heading nor a label', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(setSheets([sheet('bare', { label: null })])).rejects.toThrow(/unnamed dialog/)
  })
})

describe('Modals inert background', () => {
  const h = React.createElement

  async function renderApp() {
    await act(async () => {
      root.render(h(React.Fragment, null,
        h('main', { id: 'page' }, h('button', null, 'Behind')),
        h('nav', { id: 'tabs' }),
        h(Modals),
        h('div', { id: 'toast', 'data-over-modals': '' })))
    })
  }

  it('makes the page behind an open dialog inert, and live again once it closes', async () => {
    await renderApp()
    expect(document.getElementById('page').hasAttribute('inert')).toBe(false)

    await setSheets([sheet('open')])
    expect(document.getElementById('page').hasAttribute('inert')).toBe(true)
    expect(document.getElementById('tabs').hasAttribute('inert')).toBe(true)
    expect(document.getElementById('modal-root').hasAttribute('inert')).toBe(false)
    expect(document.getElementById('toast').hasAttribute('inert')).toBe(false)

    await setSheets([])
    expect(document.getElementById('page').hasAttribute('inert')).toBe(false)
    expect(document.getElementById('tabs').hasAttribute('inert')).toBe(false)
  })

  it('makes a sibling mounted while a dialog is open inert too, and live again once it closes', async () => {
    const renderWith = late => act(async () => {
      root.render(h(React.Fragment, null,
        h('main', { id: 'page' }, h('button', null, 'Behind')),
        late && h('div', { id: 'late' }, h('button', null, 'Late')),
        h(Modals)))
    })
    await renderWith(false)
    await setSheets([sheet('open')])
    await renderWith(true)
    const late = document.getElementById('late')
    const outside = document.createElement('div')
    await act(async () => { document.body.appendChild(outside) })
    expect(late.hasAttribute('inert')).toBe(true)
    expect(outside.hasAttribute('inert')).toBe(true)

    await setSheets([])
    expect(late.hasAttribute('inert')).toBe(false)
    expect(outside.hasAttribute('inert')).toBe(false)
    outside.remove()
  })

  it('makes a sheet covered by another sheet inert', async () => {
    await setSheets([sheet('under', { label: 'Under' }), sheet('over', { label: 'Over' })])
    const under = container.querySelector('[aria-label="Under"]')
    const over = container.querySelector('[aria-label="Over"]')
    expect(under.closest('[inert]')).toBeTruthy()
    expect(over.closest('[inert]')).toBeNull()
  })
})

