import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-frontend-state.mjs')
const fixture = join(here, 'fixtures', 'frontend-state')

let root
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); root = undefined })

// A copy of the fixture (src/over.jsx holds 5 useState calls, src/sub/at-cap.jsx 4)
// with the given allowlist.
function project(allowlist) {
  root = mkdtempSync(join(tmpdir(), 'frontend-state-'))
  cpSync(fixture, root, { recursive: true })
  if (allowlist !== undefined) writeFileSync(join(root, 'frontend-state-allowlist.json'), JSON.stringify(allowlist))
  return root
}

function check(dir) {
  const r = spawnSync(process.execPath, [script, ...(dir ? ['--root', dir] : [])], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}

describe('check-frontend-state', () => {
  it('fails a new file with 5 useState calls', () => {
    const r = check(project({}))
    expect(r.code).toBe(1)
    expect(r.out).toContain('src/over.jsx')
    expect(r.out).not.toContain('at-cap.jsx')
  })

  it('passes a file the allowlist records at its real count', () => {
    expect(check(project({ 'src/over.jsx': { count: 5, reason: 'fixture' } })).code).toBe(0)
  })

  it('fails an allowlisted file that grows past its count', () => {
    project({ 'src/over.jsx': { count: 5, reason: 'fixture' }, 'src/grown.jsx': { count: 5, reason: 'fixture' } })
    writeFileSync(join(root, 'src/grown.jsx'), 'useState(0)\n'.repeat(6))
    const r = check(root)
    expect(r.code).toBe(1)
    expect(r.out).toBe('src/grown.jsx: 6 useState calls, the allowlist allows 5. Move the state into a pure function or the store.\n')
  })

  it('fails a stale allowlist count: one above the real count', () => {
    const r = check(project({ 'src/over.jsx': { count: 6, reason: 'fixture' } }))
    expect(r.code).toBe(1)
    expect(r.out).toContain('stale')
    expect(r.out).toContain('src/over.jsx')
  })

  it('fails an entry at the cap: it is dropped, not kept', () => {
    const r = check(project({ 'src/over.jsx': { count: 5, reason: 'fixture' }, 'src/sub/at-cap.jsx': { count: 4, reason: 'fixture' } }))
    expect(r.code).toBe(1)
    expect(r.out).toContain('src/sub/at-cap.jsx')
    expect(r.out).toContain('Drop it')
  })

  it('fails a stale entry for a file that no longer exists', () => {
    const r = check(project({ 'src/over.jsx': { count: 5, reason: 'fixture' }, 'src/gone.jsx': { count: 7, reason: 'fixture' } }))
    expect(r.code).toBe(1)
    expect(r.out).toContain('src/gone.jsx')
  })

  it('passes the real tree', () => {
    const r = check()
    expect(r.out).toBe('')
    expect(r.code).toBe(0)
  })
})
