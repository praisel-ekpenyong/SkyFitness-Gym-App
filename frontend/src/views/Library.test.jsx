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

  it('initializes favorites as an empty array in DEF schema', () => {
    expect(Array.isArray(DEF.favorites)).toBe(true)
    expect(DEF.favorites).toEqual([])
    expect(Array.isArray(useStore.getState().S.favorites)).toBe(true)
  })

  it('renders an in-row star button before Plan and toggles favorite state without opening detail sheet', async () => {
    await act(async () => {
      root.render(<Library />)
    })

    // Find the first exercise row (item at index 1, since index 0 is "Create your own exercise")
    const items = container.querySelectorAll('.list .item')
    const firstExRow = items[1]
    expect(firstExRow).toBeTruthy()

    // Find the star button and plan button
    const starBtn = firstExRow.querySelector('button.iconbtn')
    const planBtn = Array.from(firstExRow.querySelectorAll('button')).find(b => b.textContent.includes('Plan'))
    expect(starBtn).toBeTruthy()
    expect(planBtn).toBeTruthy()
    expect(starBtn.compareDocumentPosition(planBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Initially unstarred: accessibility label "Add to favorites" and outline star
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(false)
    expect(useStore.getState().S.favorites).toEqual([])

    // Click star button
    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Now starred in store
    const favs = useStore.getState().S.favorites
    expect(favs.length).toBe(1)
    expect(starBtn.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(true)

    // Unstar by clicking again
    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useStore.getState().S.favorites).toEqual([])
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(false)
  })

  it('dynamically shows Favorites chip when favorites exist and filters list', async () => {
    // Start with 2 favorites
    const testFavs = ['0001', '0002']
    useStore.getState().update(s => { s.favorites = [...testFavs] })

    await act(async () => {
      root.render(<Library />)
    })

    // Favorites chip should appear first in the filter chips
    const chipButtons = Array.from(container.querySelectorAll('.chips button.chip'))
    const favChip = chipButtons.find(b => b.textContent.includes('Favorites'))
    expect(favChip).toBeTruthy()
    expect(favChip.textContent).toContain('Favorites (2)')
    expect(chipButtons[0]).toBe(favChip)

    // Click the favorites chip
    await act(async () => {
      favChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(favChip.classList.contains('on')).toBe(true)

    // The list should show only the 2 favorited exercises (+ create custom item)
    const items = container.querySelectorAll('.list .item')
    // 1 prompt item + 2 favorited items
    expect(items.length).toBe(3)

    // Refining within favorites: search query
    const searchInput = container.querySelector('input.input')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(searchInput, '3/4 sit-up')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const refinedItems = container.querySelectorAll('.list .item')
    expect(refinedItems.length).toBe(2) // prompt + 1 matching exercise (3/4 sit-up)

    // Clear favorites in store and verify chip hides
    await act(async () => {
      useStore.getState().update(s => { s.favorites = [] })
    })
    const updatedChipButtons = Array.from(container.querySelectorAll('.chips button.chip'))
    const hiddenFavChip = updatedChipButtons.find(b => b.textContent.includes('Favorites'))
    expect(hiddenFavChip).toBeUndefined()
  })

  it('filters favorites by equipment chips correctly', async () => {
    // 0001 = waist / body weight ('3/4 sit-up')
    // 0007 = back / cable ('alternate lateral pulldown')
    useStore.getState().update(s => { s.favorites = ['0001', '0007'] })

    await act(async () => {
      root.render(<Library />)
    })

    // Click Favorites chip
    const favChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.includes('Favorites'))
    expect(favChip).toBeTruthy()

    await act(async () => {
      favChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Initially shows both favorited exercises (+ create prompt)
    expect(container.querySelectorAll('.list .item').length).toBe(3)

    // Equipment chip row should contain 'body weight' and 'cable'
    const chipGroups = container.querySelectorAll('.chips')
    expect(chipGroups.length).toBe(2) // body parts/favorites row + equipment row

    const eqChips = Array.from(chipGroups[1].querySelectorAll('button.chip'))
    const cableChip = eqChips.find(b => b.textContent.toLowerCase().includes('cable'))
    expect(cableChip).toBeTruthy()

    // Filter by cable
    await act(async () => {
      cableChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const cableItems = container.querySelectorAll('.list .item')
    expect(cableItems.length).toBe(2) // 1 prompt + 1 cable exercise (alternate lateral pulldown)
    expect(cableItems[1].textContent.toLowerCase()).toContain('alternate lateral pulldown')
  })
})


