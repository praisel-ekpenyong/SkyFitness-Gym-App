// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Plan from './Plan.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { DAYN } from '../lib/dates.js'

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
    expect(name.classList.contains('d')).toBe(true)
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

describe('Plan with no Routines', () => {
  const buttonNamed = name => [...container.querySelectorAll('button')].find(b => b.textContent === name)

  it('shows the starter card in place of the Week schedule', async () => {
    useStore.getState().update(s => { s.routines = []; s.week = {} })
    await act(async () => { root.render(<Plan />) })

    expect(container.querySelectorAll('.wk-row')).toHaveLength(0)
    expect(container.textContent).not.toContain('Week schedule')
    expect(buttonNamed('Load starter plan')).toBeTruthy()
    expect(buttonNamed('Build my own plan')).toBeTruthy()
  })

  it('"Build my own plan" starts a new Routine', async () => {
    useStore.getState().update(s => { s.routines = []; s.week = {} })
    await act(async () => { root.render(<Plan />) })
    await act(async () => { buttonNamed('Build my own plan').click() })

    expect(useStore.getState().S.routines).toHaveLength(1)
  })

  it('keeps the Week schedule once a Routine exists', async () => {
    useStore.getState().update(s => { s.routines = [{ id: 'push', name: 'Push Day', emoji: 'barbell', ex: [] }] })
    await act(async () => { root.render(<Plan />) })

    expect(container.querySelectorAll('.wk-row')).toHaveLength(7)
    expect(buttonNamed('Build my own plan')).toBeUndefined()
  })
})

describe('Plan Routine cards with long names', () => {
  const cardFor = async name => {
    useStore.getState().update(s => {
      s.routines = [{ id: 'r', name, emoji: 'barbell', ex: [{ id: '0025', sets: 3, reps: 8, weight: 60 }] }]
      s.week = {}
    })
    await act(async () => { root.render(<Plan />) })
    const card = container.querySelector('.rt-card')
    return { stacked: [...card.classList].filter(c => c.startsWith('name-stacked-')).map(c => c.slice('name-stacked-'.length)), name: card.querySelector('.rt-name').textContent, label: card.getAttribute('aria-label') }
  }

  it('keeps a name that fits beside the map', async () => {
    expect(await cardFor('Posterior-chain Conditioning')).toMatchObject({ stacked: [], name: 'Posterior-chain Conditioning' })
    expect((await cardFor('Push Day')).stacked).toEqual([])
  })

  it('moves the map below a word too wide for the column, keeping the whole name', async () => {
    expect(await cardFor('Supercompensation Block')).toEqual({ stacked: ['phone', 'desktop'], name: 'Supercompensation Block', label: 'Supercompensation Block, 1 exercise' })
  })
})
