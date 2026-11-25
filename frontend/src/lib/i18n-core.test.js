import { describe, it, expect } from 'vitest'
import { t } from './i18n-core.js'

describe('t', () => {
  it('fills {0}, {1}… with its arguments', () => {
    expect(t('{0}: {1}', 'Monday', 'Push')).toBe('Monday: Push')
    expect(t('{0} sets', 3)).toBe('3 sets')
  })

  it('puts an argument in as written, even when it looks like a placeholder or a $ pattern', () => {
    expect(t('{0}: {1}', 'Day {1}', 'Rest')).toBe('Day {1}: Rest')
    expect(t('{0}, {1}', '$& legs', "$' arms")).toBe("$& legs, $' arms")
  })
})
