// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Modals from './Modals.jsx'
import { useUI } from '../store/useUI.js'

// The browser's own history stack stands in for the Back button: an open sheet owns one entry,
// so Back closes the sheet instead of leaving the page. Each test starts on "workout", one entry
// ahead of "home", and checks where the lifter ends up.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const sheet = (id, { locked = false } = {}) => ({ id, locked, label: id, kind: 'sheet', render: () => <div /> })
const setSheets = sheets => act(async () => { useUI.setState({ sheets }) })
const ids = () => useUI.getState().sheets.map(s => s.id)
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
const back = async () => { history.back(); await settle() }
const page = () => history.state?.page ?? (history.state?.skySheet ? 'sheet' : null)

beforeEach(async () => {
  history.pushState({ page: 'home' }, '', '#/home')
  history.pushState({ page: 'workout' }, '', '#/workout')
  useUI.setState({ sheets: [] })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => { root.render(<Modals />) })
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

  it('does not close a locked sheet, and does not take the lifter off the page when it is closed later', async () => {
    await setSheets([sheet('confirm')])
    await setSheets([sheet('summary', { locked: true })])
    await back()
    expect(ids()).toEqual(['summary'])

    await act(async () => { useUI.getState().closeSheet('summary') })
    await settle()
    expect(page()).toBe('workout')
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

  it('does not pull the lifter back when the app has already moved to another page', async () => {
    await setSheets([sheet('navigating')])
    history.pushState({ page: 'plan' }, '', '#/plan')
    await setSheets([])
    await settle()
    expect(page()).toBe('plan')
    expect(location.hash).toBe('#/plan')
  })
})
