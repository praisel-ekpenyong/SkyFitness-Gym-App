import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'rolldown/experimental'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const TICKET_ID = /(?<![\w&])#\d+\b|\b(issue|ticket|pr|pull request)s?\s+#?\d+/i

function sourceFiles() {
  return execFileSync('git', ['ls-files', 'frontend/*.js', 'frontend/*.jsx', 'frontend/*.mjs', 'scripts/*.js', 'scripts/*.mjs'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(f => f && !f.includes('.test.') && !f.startsWith('frontend/src/test/') && !f.includes('/fixtures/'))
}

function ticketIdsIn(file, code = readFileSync(join(ROOT, file), 'utf8')) {
  const lineOf = pos => code.slice(0, pos).split('\n').length
  return parseSync(file, code).comments
    .filter(c => TICKET_ID.test(c.value))
    .map(c => `${file}:${lineOf(c.start)}: ${c.value.trim()}`)
}

describe('comments', () => {
  it('reject a ticket id and keep commit hashes and strings', () => {
    const code = [
      '// Fixed in #97.',
      '/* Reported in issue 74 */',
      '// see ticket 04',
      '// Reverts 1dd9352, which dropped the guard.',
      "const colour = '#97'",
      '// Step 3 of the import.',
    ].join('\n')
    expect(ticketIdsIn('fixture.js', code)).toEqual([
      'fixture.js:1: Fixed in #97.',
      'fixture.js:2: Reported in issue 74',
      'fixture.js:3: see ticket 04',
    ])
  })

  it('in non-test source name no ticket or issue number', () => {
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(0)
    expect(files.every(f => !/\.(test|spec)\./.test(f) && existsSync(join(ROOT, f)))).toBe(true)
    expect(files.some(f => f.startsWith('frontend/src/'))).toBe(true)
    expect(files.some(f => f.startsWith('scripts/'))).toBe(true)
    expect(files.flatMap(f => ticketIdsIn(f))).toEqual([])
  })
})
