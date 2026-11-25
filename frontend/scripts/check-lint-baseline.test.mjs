import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

  describe('disable comments', () => {
    const passing = { 'hit.js': { [RULE]: 2 } }
    const comment = kind => `// ${kind}-disable-next-line ${RULE}\n`

    it.each(['oxlint', 'eslint'])('fails a %s disable comment, even with the baseline exact', kind => {
      project(passing)
      writeFileSync(join(root, 'quiet.js'), `${comment(kind)}export const x = 1\n`)
      const r = check()
      expect(r.code).toBe(1)
      expect(r.out).toContain('quiet.js:1')
      expect(r.out).toContain('disable comment')
    })

    it('fails a block disable comment for the whole file', () => {
      project(passing)
      writeFileSync(join(root, 'quiet.js'), '/* oxlint-disable */\nexport const x = 1\n')
      expect(check().code).toBe(1)
    })

    it('ignores the words in a string or a file oxlint ignores', () => {
      project(passing)
      writeFileSync(join(root, 'words.js'), "export const s = 'oxlint-disable'\n")
      const rc = JSON.parse(readFileSync(join(root, '.oxlintrc.json'), 'utf8'))
      writeFileSync(join(root, '.oxlintrc.json'), JSON.stringify({ ...rc, ignorePatterns: ['skip/**'] }))
      mkdirSync(join(root, 'skip'))
      writeFileSync(join(root, 'skip', 'quiet.js'), `${comment('oxlint')}export const x = 1\n`)
      expect(check().code).toBe(0)
    })
  })
})
