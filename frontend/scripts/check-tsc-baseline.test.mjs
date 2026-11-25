import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-tsc-baseline.mjs')
const fixture = join(here, 'fixtures', 'tsc-baseline')

let root
afterEach(() => rmSync(root, { recursive: true, force: true }))

function project(baseline) {
  root = mkdtempSync(join(tmpdir(), 'tsc-baseline-'))
  cpSync(fixture, root, { recursive: true })
  if (baseline !== undefined) writeFileSync(join(root, 'tsc-baseline.json'), JSON.stringify(baseline))
  return root
}

function check(...args) {
  const r = spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}

const baseline = () => JSON.parse(readFileSync(join(root, 'tsc-baseline.json'), 'utf8'))

describe('check-tsc-baseline', () => {
  it('fails a known error against an empty baseline', () => {
    project({})
    const r = check()
    expect(r.code).toBe(1)
    expect(r.out).toContain('hit.js')
    expect(r.out).toContain('TS7006')
  })

  it('passes when the baseline records exactly the errors', () => {
    project({ 'hit.js': 2 })
    expect(check().code).toBe(0)
  })

  it('fails a stale entry: a baseline above the real count', () => {
    project({ 'hit.js': 3 })
    const r = check()
    expect(r.code).toBe(1)
    expect(r.out).toContain('stale')
  })

  it('fails a stale entry for a file that no longer exists', () => {
    project({ 'hit.js': 2, 'gone.js': 1 })
    const r = check()
    expect(r.code).toBe(1)
    expect(r.out).toContain('gone.js')
  })

  it('fails when a new file with an error is added outside the baseline', () => {
    project({ 'hit.js': 2 })
    writeFileSync(join(root, 'extra.js'), 'export function c(z) { return z }\n')
    const r = check()
    expect(r.code).toBe(1)
    expect(r.out).toContain('extra.js')
  })

  it('fails loudly if tsc has a configuration error rather than treating it as clean', () => {
    project({})
    writeFileSync(join(root, 'tsconfig.json'), '{ invalid json')
    const r = check()
    expect(r.code).toBe(1)
  })

  describe('--write', () => {
    it('lowers a stale count and drops entries that no longer occur', () => {
      project({ 'hit.js': 3, 'gone.js': 1 })
      expect(check('--write').code).toBe(0)
      expect(baseline()).toEqual({ 'hit.js': 2 })
      expect(check().code).toBe(0)
    })

    it('never raises a count: new errors stay out of the baseline and still fail', () => {
      project({ 'hit.js': 1 })
      const r = check('--write')
      expect(r.code).toBe(1)
      expect(baseline()).toEqual({ 'hit.js': 1 })
    })

    it('never adds a file that was not in the baseline', () => {
      project({})
      expect(check('--write').code).toBe(1)
      expect(baseline()).toEqual({})
    })
  })
})
