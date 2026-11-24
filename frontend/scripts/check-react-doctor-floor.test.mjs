import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const here = import.meta.dirname
const script = join(here, 'check-react-doctor-floor.mjs')
const belowReport = join(here, 'fixtures', 'react-doctor-floor', 'report-below.json')

let root
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
  root = undefined
})

function project(floor) {
  root = mkdtempSync(join(tmpdir(), 'react-doctor-floor-'))
  if (floor !== undefined) writeFileSync(join(root, 'react-doctor-floor.json'), JSON.stringify(floor))
  return root
}

function report(score) {
  const file = join(root, 'report.json')
  writeFileSync(file, JSON.stringify({ summary: { score } }))
  return file
}

function check(...args) {
  const r = spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}

describe('check-react-doctor-floor', () => {
  it('fails when the report score is below the floor', () => {
    project({ score: 54 })
    const r = check('--report', belowReport)
    expect(r.code).toBe(1)
    expect(r.out).toContain('53')
    expect(r.out).toContain('54')
  })

  it('passes when the report score equals the floor', () => {
    project({ score: 53 })
    const r = check('--report', report(53))
    expect(r.code).toBe(0)
    expect(r.out).toContain('53')
  })

  it('passes when the report score is above the floor and reminds to raise it', () => {
    project({ score: 52 })
    const r = check('--report', report(53))
    expect(r.code).toBe(0)
    expect(r.out).toContain('Raise')
  })

  it('fails when the report score is null', () => {
    project({ score: 54 })
    const r = check('--report', report(null))
    expect(r.code).toBe(1)
    expect(r.out).toContain('score')
  })

  it('fails when react-doctor-floor.json is missing', () => {
    project()
    const r = check('--report', report(53))
    expect(r.code).toBe(1)
    expect(r.out).toContain('react-doctor-floor.json')
  })

  describe('--write', () => {
    it('raises the floor when the score rises', () => {
      project({ score: 50 })
      const r = check('--report', report(53), '--write')
      expect(r.code).toBe(0)
      expect(JSON.parse(readFileSync(join(root, 'react-doctor-floor.json'), 'utf8'))).toEqual({ score: 53 })
    })

    it('never lowers the floor when the score drops', () => {
      project({ score: 54 })
      const r = check('--report', report(53), '--write')
      expect(r.code).toBe(1)
      expect(JSON.parse(readFileSync(join(root, 'react-doctor-floor.json'), 'utf8'))).toEqual({ score: 54 })
    })
  })
})
