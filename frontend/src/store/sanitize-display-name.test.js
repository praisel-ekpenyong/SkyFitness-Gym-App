// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { sanitizeDisplayName } from './useStore.js'

describe('sanitizeDisplayName', () => {
  it('returns null for nullish or empty values', () => {
    expect(sanitizeDisplayName(null)).toBeNull()
    expect(sanitizeDisplayName(undefined)).toBeNull()
    expect(sanitizeDisplayName('')).toBeNull()
  })

  it('returns null for whitespace-only strings', () => {
    expect(sanitizeDisplayName('   ')).toBeNull()
    expect(sanitizeDisplayName('\t\n  \r')).toBeNull()
  })

  it('strips leading and trailing whitespace', () => {
    expect(sanitizeDisplayName('  Alex  ')).toBe('Alex')
    expect(sanitizeDisplayName('\tAlex\n')).toBe('Alex')
  })

  it('collapses multiple consecutive internal spaces into a single space', () => {
    expect(sanitizeDisplayName('Alex   Smith')).toBe('Alex Smith')
    expect(sanitizeDisplayName('Alex    J.    Smith')).toBe('Alex J. Smith')
  })

  it('collapses mixed whitespace (tabs, newlines) into a single space', () => {
    expect(sanitizeDisplayName('Alex\t\nSmith')).toBe('Alex Smith')
  })

  it('caps length at 24 characters after collapsing whitespace', () => {
    // 30 consecutive spaces between A and B collapse first to "A B", so it fits within 24 chars
    expect(sanitizeDisplayName('A' + ' '.repeat(30) + 'B')).toBe('A B')

    // 30 characters without internal spaces truncates to 24 chars
    const longName = 'abcdefghijklmnopqrstuvwxyz1234'
    expect(sanitizeDisplayName(longName)).toBe('abcdefghijklmnopqrstuvwx')
    expect(sanitizeDisplayName(longName).length).toBe(24)

    // Name with spaces truncates to exactly 24 chars
    expect(sanitizeDisplayName('Alexander The Great Champion Of The World')).toBe('Alexander The Great Cham')
    expect(sanitizeDisplayName('Alexander The Great Champion Of The World').length).toBe(24)
  })

  it('coerces numeric or other non-string primitives cleanly', () => {
    expect(sanitizeDisplayName(42)).toBe('42')
  })
})
