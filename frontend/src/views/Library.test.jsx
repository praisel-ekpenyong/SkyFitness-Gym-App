// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Library from './Library.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { cdnImgSrc } from '../lib/exercises.js'

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
  if (container) container.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

describe('Library view smoke tests', () => {
  it('renders exercise list with thumbnails and filters by body part', async () => {
    await act(async () => {
      root.render(<Library />)
    })

    // Header
    const hdr = container.querySelector('.hdr h1')
    expect(hdr?.textContent).toBe('Exercises')

    // Initial items rendered (first 40 plus the custom exercise prompt)
    const items = container.querySelectorAll('.list .item')
    expect(items.length).toBe(41)

    // First standard exercise thumbnail
    const firstThumb = container.querySelector('.list .item img.thumb')
    expect(firstThumb).toBeTruthy()
    expect(firstThumb.getAttribute('src')).toMatch(/^media\/images\/.+\.jpg$/)

    // Simulate thumbnail error triggering CDN fallback
    await act(async () => {
      firstThumb.dispatchEvent(new Event('error'))
    })
    expect(firstThumb.getAttribute('src')).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/.+\.jpg$/)

    // Filter by chest body part
    const chestChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.toLowerCase().includes('chest'))
    expect(chestChip).toBeTruthy()

    await act(async () => {
      chestChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const filteredItems = container.querySelectorAll('.list .item')
    expect(filteredItems.length).toBeGreaterThan(1)
  })

  it('searches exercises by keyword and updates list', async () => {
    await act(async () => {
      root.render(<Library />)
    })

    const searchInput = container.querySelector('input.input')
    expect(searchInput).toBeTruthy()

    await act(async () => {
      searchInput.value = 'bench press'
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      searchInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const items = container.querySelectorAll('.list .item')
    expect(items.length).toBeGreaterThan(1)
  })
})
