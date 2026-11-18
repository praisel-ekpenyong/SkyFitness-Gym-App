// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Library from './Library.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
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

    const hdr = container.querySelector('.hdr h1')
    expect(hdr?.textContent).toBe('Exercises')

    const items = container.querySelectorAll('.list .item')
    expect(items.length).toBe(41)

    const firstThumb = container.querySelector('.list .item img.thumb')
    expect(firstThumb).toBeTruthy()
    expect(firstThumb.getAttribute('src')).toMatch(/^media\/images\/.+\.jpg$/)

    await act(async () => {
      firstThumb.dispatchEvent(new Event('error'))
    })
    expect(firstThumb.getAttribute('src')).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/.+\.jpg$/)

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

    expect(container.querySelector('.searchf button.clear')).toBeNull()

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(searchInput, 'bench press')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      searchInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const items = container.querySelectorAll('.list .item')
    expect(items.length).toBeGreaterThan(1)

    const clearBtn = container.querySelector('.searchf button.clear')
    expect(clearBtn).toBeTruthy()

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

    const items = container.querySelectorAll('.list .item')
    const firstExRow = items[1]
    expect(firstExRow).toBeTruthy()

    const starBtn = firstExRow.querySelector('button.iconbtn')
    const planBtn = Array.from(firstExRow.querySelectorAll('button')).find(b => b.textContent.includes('Plan'))
    expect(starBtn).toBeTruthy()
    expect(planBtn).toBeTruthy()
    expect(starBtn.compareDocumentPosition(planBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(false)
    expect(useStore.getState().S.favorites).toEqual([])

    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const favs = useStore.getState().S.favorites
    expect(favs.length).toBe(1)
    expect(starBtn.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(true)

    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(useStore.getState().S.favorites).toEqual([])
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(false)
  })

  it('dynamically shows Favorites chip when favorites exist and filters list', async () => {
    const testFavs = ['0001', '0002']
    useStore.getState().update(s => { s.favorites = [...testFavs] })

    await act(async () => {
      root.render(<Library />)
    })

    const chipButtons = Array.from(container.querySelectorAll('.chips button.chip'))
    const favChip = chipButtons.find(b => b.textContent.includes('Favorites'))
    expect(favChip).toBeTruthy()
    expect(favChip.textContent).toContain('Favorites (2)')
    expect(chipButtons[0]).toBe(favChip)

    await act(async () => {
      favChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(favChip.classList.contains('on')).toBe(true)

    const items = container.querySelectorAll('.list .item')
    expect(items.length).toBe(3)

    const searchInput = container.querySelector('input.input')
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(searchInput, 'sit-up')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const refinedItems = container.querySelectorAll('.list .item')
    expect(refinedItems.length).toBe(2)

    await act(async () => {
      useStore.getState().update(s => { s.favorites = [] })
    })
    const updatedChipButtons = Array.from(container.querySelectorAll('.chips button.chip'))
    const hiddenFavChip = updatedChipButtons.find(b => b.textContent.includes('Favorites'))
    expect(hiddenFavChip).toBeUndefined()
  })

  it('gracefully falls back to All when the last favorite is unstarred while on the Favorites filter', async () => {
    useStore.getState().update(s => { s.favorites = ['0001'] })

    await act(async () => {
      root.render(<Library />)
    })

    const favChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.includes('Favorites'))
    expect(favChip).toBeTruthy()

    await act(async () => {
      favChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelectorAll('.list .item').length).toBe(2)

    const favRow = container.querySelectorAll('.list .item')[1]
    const starBtn = favRow.querySelector('button.iconbtn')
    expect(starBtn).toBeTruthy()

    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useStore.getState().S.favorites).toEqual([])

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
    const expected = [
      'All', 'Traps', 'Shoulders', 'Front delts', 'Side delts', 'Rear delts', 'Chest', 'Upper back', 'Lats', 'Serratus',
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

    const tricepsChip = Array.from(container.querySelectorAll('.chips button.chip'))
      .find(b => b.textContent.trim() === 'Triceps')
    expect(tricepsChip).toBeTruthy()

    await act(async () => {
      tricepsChip.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('.list .item'))
    const benchItem = items.find(it => it.textContent.toLowerCase().includes('bench press'))
    expect(benchItem).toBeTruthy()

    const secondaryBadge = benchItem.querySelector('.ss .tag')
    expect(secondaryBadge).toBeTruthy()
    expect(secondaryBadge.textContent).toContain('Secondary: Triceps')

    const primaryTricepItem = items.find(it => it.textContent.toLowerCase().includes('pushdown') || it.textContent.toLowerCase().includes('triceps dip') || it.textContent.toLowerCase().includes('triceps'))
    if (primaryTricepItem && !primaryTricepItem.textContent.toLowerCase().includes('bench press')) {
      const isSec = primaryTricepItem.querySelector('.ss .tag')
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
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set
      nativeSetter.call(searchInput, 'triceps')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const items = Array.from(container.querySelectorAll('.list .item'))
    expect(items.length).toBeGreaterThan(5)
    const names = items.map(it => it.textContent.toLowerCase())
    expect(names.some(n => n.includes('pushdown') || n.includes('extension'))).toBe(true)

    const showMore = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Show more'))
    if (showMore) {
      await act(async () => {
        showMore.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    }

    const allItems = Array.from(container.querySelectorAll('.list .item'))
    const benchItem = allItems.find(it => it.textContent.toLowerCase().includes('bench press'))
    expect(benchItem).toBeTruthy()
    expect(benchItem.querySelector('.ss .tag')?.textContent).toContain('Secondary: Triceps')
    expect(benchItem.querySelector('.ss')?.textContent.toLowerCase()).toContain('chest')
  })
})



