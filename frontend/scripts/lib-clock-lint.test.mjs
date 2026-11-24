import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// The clock selector in eslint.config.js (CODING_STANDARDS.md "The clock is an argument in `lib/`").
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const eslint = new ESLint({ cwd: root })

async function lint(code, path = 'src/lib/sample.js') {
  const [r] = await eslint.lintText(code, { filePath: join(root, path) })
  return r.messages.filter(m => m.ruleId === 'no-restricted-syntax')
}

describe('lib/ clock selector', { timeout: 60000 }, () => {
  it('rejects new Date() in lib/ and names the rule', async () => {
    const hits = await lint('export const now = () => new Date()\n')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toMatch(/clock as an argument/)
  })

  it('allows a Date built from an argument or from parts', async () => {
    expect(await lint('export const at = ms => new Date(ms)\nexport const u = new Date(2020, 0, 1)\n')).toEqual([])
  })

  it('exempts the two owners and tests, and leaves other folders alone', async () => {
    const code = 'export const now = () => new Date()\n'
    expect(await lint(code, 'src/lib/dates.js')).toEqual([])
    expect(await lint(code, 'src/lib/format.js')).toEqual([])
    expect(await lint(code, 'src/lib/sample.test.js')).toEqual([])
    expect(await lint(code, 'src/store/sample.js')).toEqual([])
  })

  it('still fires the shared selectors in lib/ beside the clock one', async () => {
    const code = [
      'export const a = date => date.toISOString().slice(0, 10)',
      'export const b = d => new Date(d)',
      'export const c = () => useStore()',
      'export const e = () => useStore(s => [s.a])',
      'export const f = () => new Date()',
      '',
    ].join('\n')
    expect(await lint(code)).toHaveLength(5)
  })
})
