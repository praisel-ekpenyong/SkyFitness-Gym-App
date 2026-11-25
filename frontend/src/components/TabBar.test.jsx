// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from './TabBar.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'

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
const tabs = () => within(container).getByRole('navigation', { name: 'Main' })
const tab = name => within(tabs()).getByRole('button', { name })

describe('tab bar Start', () => {
  it('is a tab named Start in the main navigation, beside Home', async () => {
    await render()
    const names = within(tabs()).getAllByRole('button').map(b => b.textContent)
    expect(names.indexOf('Start')).toBeGreaterThan(names.indexOf('Home'))
    expect(tab('Start').getAttribute('aria-current')).toBeNull()
  })

  it('turns to Resume, marked as running, while a workout is on', async () => {
    useStore.getState().update(s => { s.active = { id: 'a', name: 'Push', start: Date.now(), cur: 0, entries: [] } })
    await render()
    expect(within(tabs()).queryByRole('button', { name: 'Start' })).toBeNull()
    expect(tab('Resume').classList.contains('rec'), 'the running dot has no accessible name').toBe(true)
  })

  it('is the current tab on the workout screen', async () => {
    route.pathname = '/workout'
    await render()
    expect(tab('Start').getAttribute('aria-current')).toBe('page')
    expect(tab('Home').getAttribute('aria-current')).toBeNull()
  })
})
