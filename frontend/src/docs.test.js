import { readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

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
