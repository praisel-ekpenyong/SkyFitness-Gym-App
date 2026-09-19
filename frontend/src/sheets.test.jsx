// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RecapSheet, recapSheet } from './sheets.jsx'
import { useStore, DEF } from './store/useStore.js'
import { useUI } from './store/useUI.js'

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
  useUI.setState({ sheets: [], toastMsg: '', timer: null, work: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('RecapSheet', () => {
  it('renders headline numbers, deltas, and records for a month', async () => {
    useStore.getState().update(s => {
      s.workouts = [
        {
          id: 'w-jan',
          d: '2026-01-15',
          start: 1000,
          end: 1000 + 40 * 60000,
          entries: [{ id: '0025', sets: [{ w: 100, r: 5, done: true }] }],
          prs: ['0025'],
        },
        {
          id: 'w-feb',
          d: '2026-02-15',
          start: 2000,
          end: 2000 + 50 * 60000,
          entries: [{ id: '0025', sets: [{ w: 110, r: 5, done: true }] }],
          prs: ['0025'],
        },
      ]
    })

    const close = vi.fn()
    await act(async () => {
      root.render(<RecapSheet start="2026-02-01" close={close} />)
    })

    // Header with month title
    const header = container.querySelector('h3')
    expect(header?.textContent).toContain('February 2026')

    // Headline numbers
    const headlineSection = container.querySelectorAll('.sect-b')[0]
    const rows = Array.from(headlineSection.querySelectorAll('.lrow'))
    expect(rows.length).toBe(4)
    expect(rows[0].textContent).toContain('Workouts')
    expect(rows[0].textContent).toContain('1')
    expect(rows[1].textContent).toContain('Time trained')
    expect(rows[1].textContent).toContain('50 min')
    expect(rows[2].textContent).toContain('Volume')
    expect(rows[2].textContent).toContain('550 kg')
    expect(rows[3].textContent).toContain('Sets')
    expect(rows[3].textContent).toContain('1')

    // Records section should list the PR and Estimated 1RM record
    expect(container.textContent).toContain('Personal records')
    expect(container.textContent).toContain('Estimated 1RM records')

    // Month navigation: click previous month
    const prevBtn = container.querySelector('button[aria-label="Previous month"]')
    expect(prevBtn).toBeTruthy()
    await act(async () => {
      prevBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('h3')?.textContent).toContain('January 2026')

    // View calendar button
    const calBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('View calendar'))
    expect(calBtn).toBeTruthy()
    await act(async () => {
      calBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(close).toHaveBeenCalledTimes(1)
    expect(useUI.getState().sheets.length).toBe(1)
  })

  it('renders empty month message when no workouts exist', async () => {
    await act(async () => {
      root.render(<RecapSheet start="2026-05-01" close={vi.fn()} />)
    })

    expect(container.textContent).toContain('No workouts in May 2026')
  })
})
