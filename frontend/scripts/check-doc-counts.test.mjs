import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-doc-counts.mjs')
const ID = 'lint-baseline.json#eslint/complexity'
const marker = (source, key, claim) => `<!-- ratchet: ${source}#${key} -->${claim}<!-- /ratchet -->`
const claim = text => marker('lint-baseline.json', 'eslint/complexity', text)
const baseline = { 'src/a.js': { 'eslint/complexity': 3 }, 'src/b.js': { 'eslint/complexity': 2 } }
const manifest = { 'CODING_STANDARDS.md': { [ID]: 1 } }

function fixture({ line = '', otherLine = null, data = baseline, recorded = manifest } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sky-doc-counts-'))
  mkdirSync(join(root, 'frontend'))
  mkdirSync(join(root, 'docs'))
  writeFileSync(join(root, 'CODING_STANDARDS.md'), `${line}\n`)
  if (otherLine) writeFileSync(join(root, 'docs', 'TESTING_STANDARDS.md'), `${otherLine}\n`)
  writeFileSync(join(root, 'frontend', 'lint-baseline.json'), JSON.stringify(data))
  writeFileSync(join(root, 'frontend', 'doc-counts.json'), JSON.stringify(recorded))
  return root
}

function run(root, ...args) {
  return spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' })
}

function check(options) {
  const root = fixture(options)
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function doc(root, name = 'CODING_STANDARDS.md') {
  return readFileSync(join(root, name), 'utf8')
}

describe('doc count ratchet', () => {
  it('passes when a marked claim matches its baseline', () => {
    const r = check({ line: claim('5 hits in 2 files') })
    expect(r.status, r.stderr).toBe(0)
  })

  it('fails when the hit count is stale', () => {
    const r = check({ line: claim('4 hits in 2 files') })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('CODING_STANDARDS.md')
    expect(r.stderr).toContain('eslint/complexity')
    expect(r.stderr).toContain('records 4')
  })

  it('fails when the file count is stale', () => {
    const r = check({ line: claim('5 hits in 3 files') })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('records 3')
  })

  it('fails when a marker names an unknown source', () => {
    const r = check({ line: marker('nope.json', 'eslint/complexity', '5 hits in 2 files') })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('unknown source')
  })

  it('fails when a marked key has no entry in the baseline', () => {
    const r = check({ line: marker('lint-baseline.json', 'eslint/missing-rule', '5 hits in 2 files') })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no recorded count')
  })

  it('fails when every marker is removed from a doc', () => {
    const r = check({ line: 'No markers here.' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('expected 1 time(s), found 0')
  })

  it('fails when a marker is not recorded in the manifest', () => {
    const r = check({ line: claim('5 hits in 2 files'), recorded: {} })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('is not in doc-counts.json')
  })

  it('records a new marker in the manifest with --write', () => {
    const root = fixture({ line: claim('5 hits in 2 files'), recorded: {} })
    try {
      expect(run(root, '--write').status).toBe(0)
      expect(JSON.parse(doc(root, join('frontend', 'doc-counts.json'))))
        .toEqual({ 'CODING_STANDARDS.md': { [ID]: 1 } })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not bless marker removal with --write', () => {
    const root = fixture({ line: 'No markers here.' })
    try {
      expect(run(root, '--write').status).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preserves the unit word when rewriting', () => {
    const root = fixture({ line: claim('4 functions in 1 files') })
    try {
      expect(run(root, '--write').status).toBe(0)
      expect(doc(root)).toBe(`${claim('5 functions in 2 files')}\n`)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rewrites a stale claim to the real counts with --write', () => {
    const root = fixture({ line: claim('4 hits in 1 files') })
    try {
      const r = run(root, '--write')
      expect(r.status, r.stderr).toBe(0)
      expect(doc(root)).toBe(`${claim('5 hits in 2 files')}\n`)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('refreshes one doc even when another has a bad marker', () => {
    const root = fixture({
      line: claim('4 hits in 1 files'),
      otherLine: marker('nope.json', 'eslint/complexity', '5 hits in 2 files'),
    })
    try {
      expect(run(root, '--write').status).toBe(1)
      expect(doc(root)).toBe(`${claim('5 hits in 2 files')}\n`)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
