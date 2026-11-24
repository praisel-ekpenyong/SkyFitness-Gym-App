import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-lint-baseline.mjs')
const fixture = join(here, 'fixtures', 'lint-baseline')
const RULE = 'typescript/no-floating-promises'

let root
afterEach(() => rmSync(root, { recursive: true, force: true }))

// A copy of the fixture (hit.js holds two no-floating-promises hits) with the given baseline.
function project(baseline) {
  root = mkdtempSync(join(tmpdir(), 'lint-baseline-'))
  cpSync(fixture, root, { recursive: true })
  if (baseline !== undefined) writeFileSync(join(root, 'lint-baseline.json'), JSON.stringify(baseline))
  return root
}

function check(...args) {
  const r = spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}

const baseline = () => JSON.parse(readFileSync(join(root, 'lint-baseline.json'), 'utf8'))

describe('check-lint-baseline', () => {
  it('fails a known hit against an empty baseline', () => {
    project({})
    const r = check()
    expect(r.code).toBe(1)
    expect(r.out).toContain('hit.js')
    expect(r.out).toContain(RULE)
  })

  it('passes when the baseline records exactly the hits', () => {
    project({ 'hit.js': { [RULE]: 2 } })
    expect(check().code).toBe(0)
  })

  it('fails a stale entry: a baseline above the real count', () => {
    project({ 'hit.js': { [RULE]: 3 } })
    const r = check()
    expect(r.code).toBe(1)
    expect(r.out).toContain('stale')
  })

  it('fails a stale entry for a file that no longer exists', () => {
    project({ 'hit.js': { [RULE]: 2 }, 'gone.js': { [RULE]: 1 } })
    const r = check()
    expect(r.code).toBe(1)
    expect(r.out).toContain('gone.js')
  })

  describe('--write', () => {
    it('lowers a stale count and drops entries that no longer occur', () => {
      project({ 'hit.js': { [RULE]: 3 }, 'gone.js': { [RULE]: 1 } })
      expect(check('--write').code).toBe(0)
      expect(baseline()).toEqual({ 'hit.js': { [RULE]: 2 } })
      expect(check().code).toBe(0)
    })

    it('never raises a count: new hits stay out of the baseline and still fail', () => {
      project({ 'hit.js': { [RULE]: 1 } })
      const r = check('--write')
      expect(r.code).toBe(1)
      expect(baseline()).toEqual({ 'hit.js': { [RULE]: 1 } })
    })

    it('never adds a file that was not in the baseline', () => {
      project({})
      expect(check('--write').code).toBe(1)
      expect(baseline()).toEqual({})
    })
  })
})
