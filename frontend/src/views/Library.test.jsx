// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Library from './Library.jsx'
import { useStore } from '../store/useStore.js'
import { DEF } from '../lib/profile/index.js'
import { useUI } from '../store/useUI.js'
import { FILTER_MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { fireEvent, within } from '@testing-library/react'
import { chipIn, chipNamesIn, search, tileNamed, tilesIn } from '../test/library-queries.js'

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  useStore.getState().replaceState(JSON.parse(JSON.stringify(DEF)))
  useUI.setState({ sheets: [] })
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

const screen = () => within(container)
const star = tile => within(tile).getByRole('button', { name: /favorites$/ })
const render = async () => { await act(async () => { root.render(<Library />) }) }

describe('Library view smoke tests', () => {
  it('renders exercise list with thumbnails and filters by body part', async () => {
    await render()

    expect(screen().getByRole('heading', { name: 'Exercises' })).toBeTruthy()
    expect(tilesIn(container)).toHaveLength(40)

    const firstThumb = container.querySelector('img')
    expect(firstThumb.getAttribute('src')).toMatch(/^media\/images\/.+\.jpg$/)
    await act(async () => { firstThumb.dispatchEvent(new Event('error')) })
    expect(firstThumb.getAttribute('src')).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/.+\.jpg$/)

    fireEvent.click(chipIn(container, 'Chest'))
    expect(chipIn(container, 'Chest').getAttribute('aria-pressed')).toBe('true')
    expect(tilesIn(container).length).toBeGreaterThan(0)
  })

  it('searches exercises by keyword, updates list, and clears via clear button', async () => {
    await render()
    const box = screen().getByRole('textbox', { name: 'Search exercises' })
    expect(screen().queryByRole('button', { name: 'Clear' })).toBeNull()

    expect(tileNamed(container, 'bench press')).toBeUndefined()
    search(container, 'bench press')
    expect(tileNamed(container, 'bench press')).toBeTruthy()

    fireEvent.click(screen().getByRole('button', { name: 'Clear' }))
    expect(box.value).toBe('')
    expect(tilesIn(container)).toHaveLength(40)
  })

  it('initializes favorites as an empty array in DEF schema', () => {
    expect(Array.isArray(DEF.favorites)).toBe(true)
    expect(DEF.favorites).toEqual([])
    expect(Array.isArray(useStore.getState().S.favorites)).toBe(true)
  })

  it('puts a star before Plan in each row and toggles favorite state without opening the detail sheet', async () => {
    await render()

    const [row] = tilesIn(container)
    const starBtn = star(row)
    const planBtn = within(row).getByRole('button', { name: 'Plan' })
    expect(starBtn.compareDocumentPosition(planBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(useStore.getState().S.favorites).toEqual([])

    fireEvent.click(starBtn)
    expect(useStore.getState().S.favorites).toHaveLength(1)
    expect(starBtn.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(useUI.getState().sheets).toHaveLength(0)

    fireEvent.click(starBtn)
    expect(useStore.getState().S.favorites).toEqual([])
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
  })

  it('dynamically shows Favorites chip when favorites exist and filters list', async () => {
    useStore.getState().update(s => { s.favorites = ['0001', '0002'] })
    await render()

    expect(chipNamesIn(container)[0]).toBe('Favorites (2)')
    fireEvent.click(chipIn(container, 'Favorites (2)'))
    expect(chipIn(container, 'Favorites (2)').getAttribute('aria-pressed')).toBe('true')
    expect(tilesIn(container)).toHaveLength(2)

    search(container, 'sit-up')
    expect(tilesIn(container)).toHaveLength(1)

    await act(async () => { useStore.getState().update(s => { s.favorites = [] }) })
    expect(chipNamesIn(container).some(name => name.startsWith('Favorites'))).toBe(false)
  })

  it('gracefully falls back to All when the last favorite is unstarred while on the Favorites filter', async () => {
    useStore.getState().update(s => { s.favorites = ['0001'] })
    await render()

    fireEvent.click(chipIn(container, 'Favorites (1)'))
    expect(tilesIn(container)).toHaveLength(1)

    fireEvent.click(star(tilesIn(container)[0]))
    expect(useStore.getState().S.favorites).toEqual([])
    expect(chipIn(container, 'All').getAttribute('aria-pressed')).toBe('true')
    expect(tilesIn(container)).toHaveLength(40)
  })

  it('renders All, then a chip for every filter muscle in taxonomy order', async () => {
    await render()
    expect(chipNamesIn(container).slice(0, FILTER_MUSCLES.length + 1)).toEqual(['All', ...FILTER_MUSCLES.map(m => MUSCLE_NAME[m])])
  })

  it('surfaces secondary compound movements with inline secondary badges when a muscle filter is selected', async () => {
    await render()
    fireEvent.click(chipIn(container, 'Triceps'))

    const bench = tileNamed(container, 'bench press')
    expect(within(bench).getByText(/Secondary: Triceps/)).toBeTruthy()
  })

  it('searches exercises matching primary and secondary muscle names', async () => {
    await render()
    search(container, 'triceps')

    expect(tilesIn(container).length).toBeGreaterThan(5)
    expect(tilesIn(container).some(tile => /pushdown|extension/i.test(tile.getAttribute('aria-label')))).toBe(true)

    const showMore = screen().queryByRole('button', { name: 'Show more' })
    if (showMore) fireEvent.click(showMore)

    const bench = tileNamed(container, 'bench press')
    expect(within(bench).getByText(/Secondary: Triceps/)).toBeTruthy()
    expect(bench.textContent.toLowerCase()).toContain('chest')
  })
})
