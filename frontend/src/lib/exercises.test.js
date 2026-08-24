import { describe, expect, it } from 'vitest'
import { gifSrc, imgSrc } from './exercises.js'

// Sky ships no media set and deleted the server era that served /img/ and /gif/, so a plain
// static build must point at the pinned CDN by default — a relative default 404s on every
// fresh install (surfaced as console errors during ticket 08's smoke pass).
describe('exercise media sources', () => {
  it('defaults stream images and animations from the pinned CDN', () => {
    expect(imgSrc({ img: '0001.jpg' })).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/.+\/images\/0001\.jpg$/)
    expect(gifSrc({ gif: '0001.gif' })).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/.+\/videos\/0001\.gif$/)
  })
})
