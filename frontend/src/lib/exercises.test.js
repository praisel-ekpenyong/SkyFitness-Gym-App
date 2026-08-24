import { describe, expect, it } from 'vitest'
import {
  gifSrc,
  imgSrc,
  cdnGifSrc,
  cdnImgSrc,
  mediaSrc,
} from './exercises.js'

describe('exercise media sources', () => {
  const sampleEx = { id: '0001', img: '0001-2gPfomN.jpg', gif: '0001-2gPfomN.gif' }

  it('resolves local static media paths by default', () => {
    expect(imgSrc(sampleEx)).toBe('media/images/0001-2gPfomN.jpg')
    expect(gifSrc(sampleEx)).toBe('media/videos/0001-2gPfomN.gif')
  })

  it('provides helpers to resolve pinned jsDelivr CDN paths', () => {
    expect(cdnImgSrc(sampleEx)).toBe(
      'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/images/0001-2gPfomN.jpg'
    )
    expect(cdnGifSrc(sampleEx)).toBe(
      'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/videos/0001-2gPfomN.gif'
    )
  })

  it('resolves combined media URLs with mediaSrc', () => {
    expect(mediaSrc(sampleEx, { playing: false, fallback: false })).toBe('media/images/0001-2gPfomN.jpg')
    expect(mediaSrc(sampleEx, { playing: true, fallback: false })).toBe('media/videos/0001-2gPfomN.gif')
    expect(mediaSrc(sampleEx, { playing: false, fallback: true })).toBe(
      'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/images/0001-2gPfomN.jpg'
    )
    expect(mediaSrc(sampleEx, { playing: true, fallback: true })).toBe(
      'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@7455efae41b330c265e7cd4b78dfa848e7ce5ebd/videos/0001-2gPfomN.gif'
    )
  })

  it('handles empty or missing media properties safely', () => {
    expect(imgSrc(null)).toBe('')
    expect(imgSrc({})).toBe('')
    expect(gifSrc(null)).toBe('')
    expect(gifSrc({})).toBe('')
    expect(cdnImgSrc(null)).toBe('')
    expect(cdnGifSrc(null)).toBe('')
    expect(mediaSrc(null)).toBe('')
    expect(mediaSrc({})).toBe('')
  })
})
