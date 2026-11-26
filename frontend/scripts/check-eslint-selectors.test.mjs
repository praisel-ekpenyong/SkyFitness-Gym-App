import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-eslint-selectors.mjs')
const fixtures = join(here, 'fixtures', 'eslint-selectors')

function run(root) {
  return spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
}

describe('eslint selector ratchet', () => {
  it('passes when a suppressed hit is the recorded selector', () => {
    const r = run(join(fixtures, 'pass'))
    expect(r.status, r.stderr).toBe(0)
  })

  it('fails when a file swaps its suppressed selector for another', () => {
    const r = run(join(fixtures, 'fail'))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('swapped.js')
    expect(r.stderr).toContain('banned selector')
  })

  it('fails when a recorded selector no longer occurs', () => {
    const r = run(join(fixtures, 'stale'))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('clean.js')
    expect(r.stderr).toContain('stale')
  })
})
