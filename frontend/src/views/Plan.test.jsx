// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Plan from './Plan.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { DAYN } from '../lib/format.js'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null }))

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
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

// The week schedules routines, so a day row leads with what is trained; the day is its label.
describe('Plan week schedule', () => {
  const today = new Date().getDay()
  const other = (today + 2) % 7
  const seed = () => useStore.getState().update(s => {
    s.routines = [{ id: 'push', name: 'Push Day', emoji: 'barbell', ex: [{ id: '0025', sets: 3, reps: 8, weight: 60 }] }]
    s.week = { [today]: 'push', [other]: 'push' }
  })
  const rowFor = d => [...container.querySelectorAll('.wk-row')].find(r => r.querySelector('.wk-day').textContent.startsWith(DAYN[d]))

  it('leads each row with the routine name and labels it with the day', async () => {
    seed()
    await act(async () => { root.render(<Plan />) })

    const row = rowFor(other)
    const name = row.querySelector('.wk-name'), day = row.querySelector('.wk-day')
    expect(name.textContent).toBe('Push Day')
    expect(day.textContent).toBe(DAYN[other])
    expect(name.compareDocumentPosition(day) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(row.getAttribute('aria-current')).toBeNull()
  })

  it('marks today in words, not only in colour', async () => {
    seed()
    await act(async () => { root.render(<Plan />) })

    const row = rowFor(today)
    expect(row.querySelector('.wk-day').textContent).toBe(`${DAYN[today]} · Today`)
    expect(row.getAttribute('aria-current')).toBe('date')
    expect([...container.querySelectorAll('.wk-row')].filter(r => r.textContent.includes('Today'))).toHaveLength(1)
  })
})
