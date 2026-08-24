import { describe, expect, it } from 'vitest'
import {
  EXDB,
  EXIDX,
  BODYPARTS,
  PINNED_DATASET_COMMIT,
  CDN_IMG_BASE,
  CDN_GIF_BASE,
  gifSrc,
  imgSrc,
  cdnGifSrc,
  cdnImgSrc,
  mediaSrc,
  smOf,
  equipmentOf,
  registerCustom,
  allExercises,
  isCardio,
  isBodyweightEq,
  exOr,
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

describe('exercise dataset integrity and helpers', () => {
  it('contains 1,324 exercises with valid ids, media files, and body parts', () => {
    expect(EXDB).toHaveLength(1324)
    expect(BODYPARTS.length).toBeGreaterThan(0)
    expect(PINNED_DATASET_COMMIT).toMatch(/^[0-9a-f]{40}$/)
    expect(CDN_IMG_BASE).toContain(PINNED_DATASET_COMMIT)
    expect(CDN_GIF_BASE).toContain(PINNED_DATASET_COMMIT)

    for (const ex of EXDB) {
      expect(ex.id).toBeTruthy()
      expect(ex.n).toBeTruthy()
      expect(ex.bp).toBeTruthy()
      expect(ex.img).toMatch(/^[0-9]{4}-.+\.jpg$/)
      expect(ex.gif).toMatch(/^[0-9]{4}-.+\.gif$/)
      expect(imgSrc(ex)).toBe(`media/images/${ex.img}`)
      expect(gifSrc(ex)).toBe(`media/videos/${ex.gif}`)
      expect(cdnImgSrc(ex)).toBe(`${CDN_IMG_BASE}${ex.img}`)
      expect(cdnGifSrc(ex)).toBe(`${CDN_GIF_BASE}${ex.gif}`)
    }
  })

  it('enriches secondary muscles with smOf without mutating dataset', () => {
    const row = EXIDX['0027']
    expect(row).toBeDefined()
    const sm = smOf(row)
    expect(sm).toContain('rear deltoids')
    expect(row.sm).not.toContain('rear deltoids') // pristine dataset untouched
  })

  it('registers and unregisters custom exercises in EXIDX and allExercises', () => {
    const custom = [{ id: 'custom-1', n: 'Custom Lift', bp: 'chest', eq: 'barbell' }]
    registerCustom(custom)
    expect(EXIDX['custom-1']).toEqual(custom[0])

    const all = allExercises({ customEx: custom })
    expect(all[0]).toEqual(custom[0])
    expect(all).toHaveLength(1325)

    // Clear custom exercises
    registerCustom([])
    expect(EXIDX['custom-1']).toBeUndefined()
  })

  it('handles bodyweight and cardio detection correctly', () => {
    const situp = EXIDX['0001']
    expect(isBodyweightEq(situp)).toBe(true)
    expect(isBodyweightEq(situp.id)).toBe(true)

    const cardioEx = EXIDX['3220'] // astride jumps (cardio)
    expect(isCardio(cardioEx)).toBe(true)
    expect(isCardio(cardioEx.id)).toBe(true)
  })

  it('provides safe fallback for unknown exercise IDs via exOr', () => {
    const known = exOr('0001')
    expect(known.n).toBe('3/4 sit-up')

    const unknown = exOr('unknown-999')
    expect(unknown.id).toBe('unknown-999')
    expect(unknown.missing).toBe(true)
    expect(unknown.n).toBe('Unknown exercise')
  })

  it('sorts and deduplicates equipment with equipmentOf', () => {
    const list = [
      { eq: 'dumbbell' },
      { eq: 'barbell' },
      { eq: 'dumbbell' },
      { eq: 'cable' },
      { eq: 'dumbbell' },
    ]
    expect(equipmentOf(list)).toEqual(['dumbbell', 'barbell', 'cable'])
  })
})
