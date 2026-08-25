// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ExerciseDetail, deleteCustomEx } from './sheets.jsx'
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

describe('ExerciseDetail sheet favorite starring', () => {
  const sampleEx = {
    id: '0001',
    n: '3/4 sit-up',
    bp: 'waist',
    tg: 'abs',
    eq: 'body weight',
    img: '0001-2gPfomN.jpg',
    gif: '0001-2gPfomN.gif'
  }

  it('renders title header with interactive star button and toggles favorite state', async () => {
    await act(async () => {
      root.render(<ExerciseDetail ex={sampleEx} close={vi.fn()} />)
    })

    // Header title and star button
    const title = container.querySelector('h3')
    expect(title).toBeTruthy()
    expect(title.textContent).toBe('3/4 sit-up')

    const starBtn = container.querySelector('.row.between button.iconbtn')
    expect(starBtn).toBeTruthy()
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(false)
    expect(starBtn.querySelector('svg.icn')).toBeTruthy()
    expect(starBtn.querySelector('path').getAttribute('fill')).toBeNull()
    expect(useStore.getState().S.favorites).toEqual([])

    // Click star button to add to favorites
    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useStore.getState().S.favorites).toEqual(['0001'])
    expect(starBtn.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(true)
    expect(starBtn.querySelector('svg.icn path').getAttribute('fill')).toBe('currentColor')

    // Click star button again to remove from favorites
    await act(async () => {
      starBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(useStore.getState().S.favorites).toEqual([])
    expect(starBtn.getAttribute('aria-label')).toBe('Add to favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(false)
    expect(starBtn.querySelector('svg.icn path').getAttribute('fill')).toBeNull()
  })

  it('initializes filled star if exercise is already favorited', async () => {
    useStore.getState().update(s => {
      s.favorites = ['0001', '0002']
    })

    await act(async () => {
      root.render(<ExerciseDetail ex={sampleEx} close={vi.fn()} />)
    })

    const starBtn = container.querySelector('.row.between button.iconbtn')
    expect(starBtn).toBeTruthy()
    expect(starBtn.getAttribute('aria-label')).toBe('Remove from favorites')
    expect(starBtn.classList.contains('on-ss')).toBe(true)
    expect(starBtn.querySelector('svg.icn path').getAttribute('fill')).toBe('currentColor')
  })
})

describe('deleteCustomEx cascading deletion', () => {
  it('removes custom exercise ID from favorites, customEx, routines, and exWeights', async () => {
    const customEx = {
      id: 'c123',
      n: 'My Custom Curl',
      bp: 'arms',
      tg: '',
      eq: 'custom',
      custom: true
    }

    useStore.getState().update(s => {
      s.customEx = [customEx]
      s.favorites = ['0001', 'c123', '0002']
      s.exWeights = { c123: 25, '0001': 50 }
      s.routines = [
        { id: 'r1', name: 'Arm Day', emoji: '💪', ex: [{ id: 'c123', sets: 3, reps: 10 }, { id: '0001', sets: 3, reps: 10 }] }
      ]
    })

    const afterDelete = vi.fn()
    deleteCustomEx(customEx, afterDelete)

    // A confirm dialog should have opened in useUI sheets
    const sheets = useUI.getState().sheets
    expect(sheets.length).toBe(1)
    expect(sheets[0].kind).toBe('center')

    // Mount the confirm sheet dialog to trigger onConfirm
    const renderConfirm = sheets[0].render
    let confirmContainer = document.createElement('div')
    document.body.appendChild(confirmContainer)
    const confirmRoot = createRoot(confirmContainer)

    await act(async () => {
      confirmRoot.render(renderConfirm(() => useUI.getState().closeSheet(sheets[0].id)))
    })

    const confirmBtn = confirmContainer.querySelector('button.btn.danger')
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn.textContent).toBe('Delete')

    await act(async () => {
      confirmBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Verify state after deletion
    const state = useStore.getState().S
    expect(state.customEx.find(e => e.id === 'c123')).toBeUndefined()
    expect(state.favorites).toEqual(['0001', '0002'])
    expect(state.exWeights['c123']).toBeUndefined()
    expect(state.routines[0].ex).toEqual([{ id: '0001', sets: 3, reps: 10 }])
    expect(afterDelete).toHaveBeenCalledTimes(1)

    await act(async () => {
      confirmRoot.unmount()
    })
    confirmContainer.remove()
  })
})
