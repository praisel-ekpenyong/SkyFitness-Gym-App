import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-ts-comments.mjs')
const fixtures = join(here, 'fixtures', 'ts-comments')

function run(root) {
  return spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' })
}

describe('ts-comment check', () => {
  it('passes a tree with no ts directives', () => {
    const r = run(join(fixtures, 'clean'))
    expect(r.status, r.stderr).toBe(0)
  })

  it('fails a .js file that opts out of tsc, naming the file and line', () => {
    const r = run(join(fixtures, 'bad'))
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('bad.js:1')
    expect(r.stderr).toContain('bad.js:3')
    expect(r.stderr).toContain('bad.js:6')
  })
})
