import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { findBrokenRefs } from './docs-paths.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const adrDir = resolve(__dirname, '..', '..', 'docs', 'adr')

describe('ADRs', () => {
  const files = readdirSync(adrDir).filter(f => f.endsWith('.md') && f !== 'README.md')

  it('are named NNNN-slug.md', () => {
    expect(files.filter(f => !/^\d{4}-[a-z0-9-]+\.md$/.test(f))).toEqual([])
  })

  // Two branches can each take the next number; whichever merges second must renumber.
  it('never share a number', () => {
    const byNumber = {}
    for (const f of files) (byNumber[f.slice(0, 4)] ||= []).push(f)
    expect(Object.values(byNumber).filter(list => list.length > 1)).toEqual([])
  })
})

const root = resolve(__dirname, '..', '..')

// Gitignored build output and fetched media: docs name them, a clean checkout lacks them.
const ALLOW = ['frontend/.tmp/review/', 'frontend/dist', 'frontend/dist/', 'frontend/public/media/']

describe('docs paths', () => {
  it('flag a missing link or path as file:line and ignore fenced code', () => {
    const dir = mkdtempSync(join(tmpdir(), 'docs-'))
    mkdirSync(join(dir, 'frontend/src/lib'), { recursive: true })
    mkdirSync(join(dir, 'docs'))
    writeFileSync(join(dir, 'frontend/src/lib/real.js'), '')
    writeFileSync(join(dir, 'docs/other.md'), '')
    const doc = join(dir, 'docs/a.md')
    writeFileSync(doc, [
      'Good: [x](other.md#top), `lib/real.js`, `frontend/src/lib/real.js`, `src/lib/real.js`.',
      'Bad link: [y](gone.md)',
      'Bad path: `lib/gone.js`',
      'External: [z](https://example.com/docs/x.md)',
      '```',
      'git diff docs/ignored.md  `lib/ignored.js`',
      '```',
    ].join('\n'))
    expect(findBrokenRefs([doc], dir)).toEqual(['docs/a.md:2: gone.md', 'docs/a.md:3: lib/gone.js'])
  })

  // docs/adr/ is left out until ticket 08 finishes rewriting the ADRs; it then adds docs/adr here.
  it('point at files that exist in the repo markdown docs', () => {
    const files = execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
      .split('\n').filter(f => f && !f.startsWith('docs/adr/') && !f.startsWith('.taste-skill/') && f !== 'CHANGELOG.md')
      .map(f => resolve(root, f))
    expect(findBrokenRefs(files, root, ALLOW)).toEqual([])
  })
})
