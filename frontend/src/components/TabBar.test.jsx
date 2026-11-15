// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar.jsx'
import { useStore, DEF } from '../store/useStore.js'

const route = vi.hoisted(() => ({ pathname: '/home' }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useLocation: () => route }))

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
  route.pathname = '/home'
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  container?.remove()
  root = null
  container = null
})

const render = async () => { await act(async () => { root.render(<TabBar onStart={vi.fn()} />) }) }
const startTab = () => container.querySelector('#tabbar button.start')

// Nav stays neutral (DESIGN.md rule 3): Start is a tab like the others, an icon over a word on
// the same line, and only a running workout colours it.
describe('tab bar Start', () => {
  it('is drawn like every other tab: an icon and a label, no block behind it', async () => {
    await render()
    const home = [...container.querySelectorAll('#tabbar button')].find(b => b.textContent === 'Home')
    const start = startTab()
    expect(start.textContent).toBe('Start')
    expect(start.querySelector('.cir')).toBeNull()
    expect([...start.children].map(c => c.tagName.toLowerCase())).toEqual([...home.children].map(c => c.tagName.toLowerCase()))
    expect(start.classList.contains('rec')).toBe(false)
  })

  it('turns to Resume, marked as running, while a workout is on', async () => {
    useStore.getState().update(s => { s.active = { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [] } })
    await render()
    expect(startTab().textContent).toBe('Resume')
    expect(startTab().classList.contains('rec')).toBe(true)
  })

  it('is the current tab on the workout screen', async () => {
    route.pathname = '/workout'
    await render()
    expect(startTab().getAttribute('aria-current')).toBe('page')
    expect(startTab().classList.contains('on')).toBe(true)
  })
})
