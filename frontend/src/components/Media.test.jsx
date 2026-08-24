// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Media, { Thumb } from './Media.jsx'
import { cdnImgSrc, cdnGifSrc } from '../lib/exercises.js'

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  if (container) container.remove()
  root = null
  container = null
})

describe('Thumb component', () => {
  it('renders dumbbell icon when ex has no img', async () => {
    await act(async () => {
      root.render(<Thumb ex={{ id: 'c1', n: 'Custom' }} />)
    })
    expect(container.querySelector('.thumb-x')).toBeTruthy()
  })

  it('renders img with local path by default and falls back to CDN onError', async () => {
    const ex = { id: '0001', n: '3/4 sit-up', img: '0001-2gPfomN.jpg' }
    await act(async () => {
      root.render(<Thumb ex={ex} />)
    })
    const img = container.querySelector('img.thumb')
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('media/images/0001-2gPfomN.jpg')

    // Trigger error event to simulate missing local asset
    await act(async () => {
      img.dispatchEvent(new Event('error'))
    })
    expect(img.getAttribute('src')).toBe(cdnImgSrc(ex))
  })

  it('resets fallback state when ex prop changes', async () => {
    const ex1 = { id: '0001', n: '3/4 sit-up', img: '0001-2gPfomN.jpg' }
    const ex2 = { id: '0002', n: '45° side bend', img: '0002-3hQgomO.jpg' }

    await act(async () => {
      root.render(<Thumb ex={ex1} />)
    })
    const img = container.querySelector('img.thumb')
    await act(async () => {
      img.dispatchEvent(new Event('error'))
    })
    expect(img.getAttribute('src')).toBe(cdnImgSrc(ex1))

    // Re-render with ex2
    await act(async () => {
      root.render(<Thumb ex={ex2} />)
    })
    expect(img.getAttribute('src')).toBe('media/images/0002-3hQgomO.jpg')
  })
})

describe('Media component', () => {
  it('returns null when ex has no gif', async () => {
    await act(async () => {
      root.render(<Media ex={{ id: 'c1', n: 'Custom' }} />)
    })
    expect(container.querySelector('.exmedia')).toBeNull()
  })

  it('renders playing GIF with local path and falls back to CDN onError', async () => {
    const ex = { id: '0001', n: '3/4 sit-up', img: '0001-2gPfomN.jpg', gif: '0001-2gPfomN.gif' }
    await act(async () => {
      root.render(<Media ex={ex} />)
    })
    const img = container.querySelector('.exmedia img')
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('media/videos/0001-2gPfomN.gif')

    // Trigger error event to simulate missing local asset
    await act(async () => {
      img.dispatchEvent(new Event('error'))
    })
    expect(img.getAttribute('src')).toBe(cdnGifSrc(ex))
  })

  it('tracks GIF and still image failure states independently', async () => {
    const ex = { id: '0001', n: '3/4 sit-up', img: '0001-2gPfomN.jpg', gif: '0001-2gPfomN.gif' }
    await act(async () => {
      root.render(<Media ex={ex} />)
    })
    const mediaDiv = container.querySelector('.exmedia')
    const img = container.querySelector('.exmedia img')

    // GIF fails and switches to CDN GIF
    await act(async () => {
      img.dispatchEvent(new Event('error'))
    })
    expect(img.getAttribute('src')).toBe(cdnGifSrc(ex))

    // Tap to pause: should attempt local image first (independent from GIF failure)
    await act(async () => {
      mediaDiv.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(img.getAttribute('src')).toBe('media/images/0001-2gPfomN.jpg')

    // Still image fails too: switches to CDN image
    await act(async () => {
      img.dispatchEvent(new Event('error'))
    })
    expect(img.getAttribute('src')).toBe(cdnImgSrc(ex))
  })

  it('resets failure state when ex prop changes', async () => {
    const ex1 = { id: '0001', n: '3/4 sit-up', img: '0001-2gPfomN.jpg', gif: '0001-2gPfomN.gif' }
    const ex2 = { id: '0002', n: '45° side bend', img: '0002-3hQgomO.jpg', gif: '0002-3hQgomO.gif' }

    await act(async () => {
      root.render(<Media ex={ex1} />)
    })
    const img = container.querySelector('.exmedia img')
    await act(async () => {
      img.dispatchEvent(new Event('error'))
    })
    expect(img.getAttribute('src')).toBe(cdnGifSrc(ex1))

    // Switch to ex2
    await act(async () => {
      root.render(<Media ex={ex2} />)
    })
    expect(img.getAttribute('src')).toBe('media/videos/0002-3hQgomO.gif')
  })
})
