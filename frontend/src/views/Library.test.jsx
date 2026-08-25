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

  it('searches exercises by keyword, updates list, and clears via clear button', async () => {
    await act(async () => {
      root.render(<Library />)
    })

    const searchInput = container.querySelector('input.input')
    expect(searchInput).toBeTruthy()

    // Clear button should not exist when search query is empty
    expect(container.querySelector('.searchf button.clear')).toBeNull()

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(searchInput, 'bench press')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      searchInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const items = container.querySelectorAll('.list .item')
    expect(items.length).toBeGreaterThan(1)

    // Clear button should now be visible
    const clearBtn = container.querySelector('.searchf button.clear')
    expect(clearBtn).toBeTruthy()

    // Clicking clear button resets search query and restores full list
    await act(async () => {
      clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(searchInput.value).toBe('')
    expect(container.querySelectorAll('.list .item').length).toBe(41)
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

  it('gracefully falls back to All when the last favorite is unstarred while on the Favorites filter', async () => {
    // Start with 1 favorite
    useStore.getState().update(s => { s.favorites = ['0001'] })

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

    // On favorites filter: shows 1 favorite + prompt
    expect(container.querySelectorAll('.list .item').length).toBe(2)

    // Unstar the single favorite exercise via in-row star button
    const favRow = container.querySelectorAll('.list .item')[1]
    const starBtn = favRow.querySelector('button.iconbtn')
    expect(starBtn).toBeTruthy()

    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Favorites is now empty
    expect(useStore.getState().S.favorites).toEqual([])

    // Active filter automatically falls back to All, so All chip is highlighted and full exercise list is shown
    const allChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.trim() === 'All')
    expect(allChip?.classList.contains('on')).toBe(true)
    expect(container.querySelectorAll('.list .item').length).toBe(41)
  })

  it('renders all 19 canonical muscle filter chips plus Cardio in anatomical head-to-toe order', async () => {
    await act(async () => {
      root.render(<Library />)
    })

    const firstChipsRow = container.querySelectorAll('.chips')[0]
    const chips = Array.from(firstChipsRow.querySelectorAll('button.chip')).map(c => c.textContent.trim())
    // Expected order: All, Traps, Shoulders, Chest, Upper back, Lats, Serratus, Biceps, Triceps, Forearms, Abs, Obliques, Lower back, Glutes, Quads, Hamstrings, Adductors, Hip flexors, Calves, Shins, Cardio
    const expected = [
      'All', 'Traps', 'Shoulders', 'Chest', 'Upper back', 'Lats', 'Serratus',
      'Biceps', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Lower back',
      'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Hip flexors',
      'Calves', 'Shins', 'Cardio',
    ]
    expect(chips).toEqual(expected)
  })

  it('surfaces secondary compound movements with inline secondary badges when a muscle filter is selected', async () => {
    await act(async () => {
      root.render(<Library />)
    })

    // Filter by Triceps
    const tricepsChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.trim() === 'Triceps')
    expect(tricepsChip).toBeTruthy()

    await act(async () => {
      tricepsChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('.list .item'))
    // Find bench press (which has chest as primary and triceps as secondary)
    const benchItem = items.find(it => it.textContent.toLowerCase().includes('bench press'))
    expect(benchItem).toBeTruthy()

    // Bench press should display the secondary badge: "Secondary: Triceps"
    const secondaryBadge = benchItem.querySelector('.ss .tag')
    expect(secondaryBadge).toBeTruthy()
    expect(secondaryBadge.textContent).toContain('Secondary: Triceps')

    // An exercise with Triceps as primary (e.g. pushdown or dip) should NOT have the secondary badge
    const primaryTricepItem = items.find(it => it.textContent.toLowerCase().includes('pushdown') || it.textContent.toLowerCase().includes('triceps dip') || it.textContent.toLowerCase().includes('triceps'))
    if (primaryTricepItem && !primaryTricepItem.textContent.toLowerCase().includes('bench press')) {
      const isSec = primaryTricepItem.querySelector('.ss .tag')
      // If its primary muscle is triceps, it should not have a secondary badge for Triceps
      if (primaryTricepItem.textContent.toLowerCase().includes('triceps ·')) {
        expect(isSec).toBeNull()
      }
    }
  })

  it('searches exercises matching primary and secondary muscle names', async () => {
    await act(async () => {
      root.render(<Library />)
    })

    const searchInput = container.querySelector('input.input')
    // Search for "triceps"
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(searchInput, 'triceps')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.length).toBeGreaterThan(5)
    // Matches primary tricep exercises and compound movements with secondary triceps
    const names = items.map(it => it.textContent.toLowerCase())
    expect(names.some(n => n.includes('pushdown') || n.includes('extension'))).toBe(true)

    // Bench press should have "Secondary: Triceps" badge because triceps is its secondary target
    const benchItem = items.find(it => it.textContent.toLowerCase().includes('bench press'))
    expect(benchItem).toBeTruthy()
    expect(benchItem.querySelector('.ss .tag')?.textContent).toContain('Secondary: Triceps')
    // Primary muscle subtitle uses canonical display name "Chest", not raw "pectorals"
    expect(benchItem.querySelector('.ss')?.textContent.toLowerCase()).toContain('chest')
  })
})



