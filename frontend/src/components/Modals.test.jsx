import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Modals from './Modals.jsx'
import { useUI } from '../store/useUI.js'


let dom
let root
let container

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

  // Sheet history is tested against a real stack in Modals.history.test.jsx; these tests need only inert stand-ins.
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { href: 'https://sky.test/#/workout' } })
  Object.defineProperty(globalThis, 'history', { configurable: true, value: { pushState() {}, go() {} } })

  container = document.getElementById('root')
  root = createRoot(container)
}

async function setSheets(sheets) {
  await act(async () => { useUI.setState({ sheets }) })
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
  useUI.setState({ sheets: [] })
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
    expect(useUI.getState().sheets).toHaveLength(1)
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
    expect(useUI.getState().sheets).toHaveLength(1)
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

