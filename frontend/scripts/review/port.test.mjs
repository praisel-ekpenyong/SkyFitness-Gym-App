import { describe, expect, it } from 'vitest'
import { PORT_BASE, PORT_SPAN, defaultPort } from './port.mjs'

describe('review default port', () => {
  it('is stable for one worktree path', () => {
    expect(defaultPort('/a/.worktrees/x/frontend')).toBe(defaultPort('/a/.worktrees/x/frontend'))
  })
  it('stays in range, away from 5173, 5174 and 5198', () => {
    for (let i = 0; i < 500; i++) {
      const p = defaultPort(`/a/.worktrees/w${i}/frontend`)
      expect(p).toBeGreaterThanOrEqual(PORT_BASE)
      expect(p).toBeLessThan(PORT_BASE + PORT_SPAN)
    }
  })
  it('spreads different worktrees over different ports', () => {
    const ports = new Set(['dr14-docs', 'dr13-weight-zero', 'dr09-schema-version', 'dr10-storage'].map(n => defaultPort(`/r/.worktrees/${n}/frontend`)))
    expect(ports.size).toBeGreaterThan(2)
  })
})
