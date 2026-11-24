// Guard: a source comment names no ticket or issue number. The number rots; the reason belongs
// in the comment in words, or in an ADR. Commit hashes cited on purpose stay allowed.
//
// Scope: every tracked .js/.jsx/.mjs file in frontend/ except tests, test helpers (src/test/)
// and check fixtures. Comments come from the parser, so `#97` inside a string is not a hit.
// There is no allowlist: reword the comment instead (CODING_STANDARDS.md "Comments").
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'rolldown/experimental'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// "#97", "issue #74", "ticket 04", "PR 12". Not "&#123;" or a word ending in digits.
const TICKET_ID = /(?<![\w&])#\d+\b|\b(issue|ticket|pr|pull request)s?\s+#?\d+/i

// Run from the repo root: the pre-commit hook sets GIT_DIR, which makes git take its cwd as the top.
function sourceFiles() {
  return execFileSync('git', ['ls-files', 'frontend/*.js', 'frontend/*.jsx', 'frontend/*.mjs'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(f => f && !f.includes('.test.') && !f.startsWith('frontend/src/test/') && !f.includes('/fixtures/'))
}

/** "file:line: comment text" for each comment in `code` that names a ticket id. */
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
    expect(files).toContain('frontend/src/lib/import-csv.js')
    expect(files.flatMap(f => ticketIdsIn(f))).toEqual([])
  })
})
