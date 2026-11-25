import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const eslint = new ESLint({ cwd: root })

async function messages(code, file) {
  const [r] = await eslint.lintText(code, { filePath: resolve(root, file) })
  return r.messages.filter(m => m.ruleId === 'no-restricted-syntax').map(m => m.message)
}

const cases = [
  ['LB_TO_KG identifier', 'const k = x * LB_TO_KG\n', 'lib/units.js'],
  ['the 2.2046 literal', 'const k = x * 2.2046\n', 'lib/units.js'],
  ['the 0.4535 literal', 'const k = x * 0.4535\n', 'lib/units.js'],
  ['inline one-decimal rounding', 'const r = Math.round(x * 10) / 10\n', 'lib/units.js'],
  ['Monday-first weekday', 'const d = (new Date().getDay() + 6) % 7\n', 'lib/dates.js'],
]

describe('owner selectors', () => {
  for (const [name, code, owner] of cases) {
    it(`fails ${name} outside ${owner}, naming the owner`, async () => {
      const hits = await messages(code, 'src/views/Fixture.jsx')
      expect(hits).toHaveLength(1)
      expect(hits[0]).toContain(owner)
    })
    it(`allows ${name} inside ${owner}`, async () => {
      expect(await messages(code, `src/${owner}`)).toEqual([])
    })
  }

  it('does not hit a plain modulo 7', async () => {
    expect(await messages('const r = padded.length % 7\n', 'src/views/Fixture.jsx')).toEqual([])
  })

  it('fails a % 60 duration in a view, naming both owners', async () => {
    const hits = await messages('export const s = seconds % 60\n', 'src/views/Fixture.jsx')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('lib/format.js')
    expect(hits[0]).toContain('lib/dates.js')
  })

  it.each(['src/lib/format.js', 'src/lib/dates.js'])('allows a % 60 duration in %s', async path => {
    expect(await messages('export const s = seconds % 60\n', path)).toEqual([])
  })
})
