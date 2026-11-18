import { describe, expect, it } from 'vitest'
import { DEFAULT_GLYPH, GLYPH_GROUPS, glyphOf } from './glyphs.js'

const ICONS = ['figureStrength', 'arm', 'legs', 'dumbbell', 'timer']

describe('glyphOf', () => {
  it('keeps an icon name the caller can render', () => {
    expect(glyphOf('arm', ICONS)).toBe('arm')
    expect(glyphOf('timer', ICONS)).toBe('timer')
  })

  it('falls back to the default for a name outside the caller’s icon set', () => {
    expect(glyphOf('crown', ICONS)).toBe(DEFAULT_GLYPH)
  })

  it('maps a legacy emoji even when the caller’s icon set is empty', () => {
    expect(glyphOf('🦵', [])).toBe('legs')
    expect(glyphOf('🦍', [])).toBe('kettlebell')
  })

  it('retries an unrecognised emoji on its base character', () => {
    expect(glyphOf('🏋️', ICONS)).toBe('dumbbell')
  })

  it('uses the default for a missing or unknown value', () => {
    expect(glyphOf('', ICONS)).toBe(DEFAULT_GLYPH)
    expect(glyphOf(undefined, ICONS)).toBe(DEFAULT_GLYPH)
    expect(glyphOf('not-an-icon', ICONS)).toBe(DEFAULT_GLYPH)
  })
})

describe('glyph groups', () => {
  it('offers the default glyph in a named group', () => {
    expect(GLYPH_GROUPS.length).toBeGreaterThan(0)
    expect(GLYPH_GROUPS.flatMap(g => g.items)).toContain(DEFAULT_GLYPH)
  })
})
