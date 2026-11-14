// @vitest-environment happy-dom
// A build without bundled media (vite.config.js) points the primary URL at the CDN, so the
// fallback is the same URL: one failure must be enough to show the dumbbell tile.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

await vi.hoisted(async () => {
  const { CDN_IMG_BASE, CDN_GIF_BASE } = await import('../lib/media-cdn.js')
  process.env.VITE_IMG_BASE = CDN_IMG_BASE
  process.env.VITE_GIF_BASE = CDN_GIF_BASE
})

import Media, { Thumb } from './Media.jsx'
import { cdnImgSrc, cdnGifSrc } from '../lib/exercises.js'

let container
let root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (root) await act(async () => { root.unmount() })
  container.remove()
})

const ex = { id: '0001', n: '3/4 sit-up', img: '0001-2gPfomN.jpg', gif: '0001-2gPfomN.gif' }

describe('art served from the CDN only', () => {
  it('Thumb shows the dumbbell tile after the one URL fails', async () => {
    await act(async () => { root.render(<Thumb ex={ex} />) })
    const img = container.querySelector('img.thumb')
    expect(img.getAttribute('src')).toBe(cdnImgSrc(ex))
    await act(async () => { img.dispatchEvent(new Event('error')) })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.thumb.thumb-x')).toBeTruthy()
  })

  it('Media shows the dumbbell tile after the one URL fails', async () => {
    await act(async () => { root.render(<Media ex={ex} />) })
    const img = container.querySelector('.exmedia img')
    expect(img.getAttribute('src')).toBe(cdnGifSrc(ex))
    await act(async () => { img.dispatchEvent(new Event('error')) })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.exmedia .thumb-x')).toBeTruthy()
  })
})
