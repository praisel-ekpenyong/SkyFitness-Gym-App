import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const eslint = new ESLint({ cwd: root })

async function lint(code, path = 'src/lib/sample.js') {
  const [r] = await eslint.lintText(code, { filePath: join(root, path) })
  return r.messages.filter(m => m.ruleId === 'no-restricted-syntax')
}

describe('local-dates selectors', { timeout: 60000 }, () => {
  it('rejects toISOString().slice for a day key and names the helpers', async () => {
    const hits = await lint('export const k = date => date.toISOString().slice(0, 10)\n')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toMatch(/todayISO/)
    expect(hits[0].message).toMatch(/isoOf/)
  })

  it('rejects new Date(d) on a day-only string and names parseDay', async () => {
    const member = await lint('export const t = w => new Date(w.d).getTime()\n')
    const bare = await lint('export const t = d => new Date(d).getTime()\n')
    expect(member).toHaveLength(1)
    expect(bare).toHaveLength(1)
    expect(member[0].message).toMatch(/parseDay/)
  })

  it('allows a day parsed with parseDay and a Date built from parts', async () => {
    expect(await lint("import { parseDay } from './dates.js'\nexport const t = d => parseDay(d)\nexport const u = new Date(2020, 0, 1)\n")).toEqual([])
  })

  it('rejects a day or month key padded by hand and names the helpers', async () => {
    const day = await lint("export const k = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')\n", 'src/sheets/sample.jsx')
    const month = await lint("export const k = (y, m) => `${y}-${String(m).padStart(2, '0')}`\n")
    expect(day).toHaveLength(2)
    expect(month).toHaveLength(1)
    expect(month[0].message).toMatch(/isoOf/)
    expect(month[0].message).toMatch(/monthKey/)
  })

  it('allows the padding inside the owners lib/dates.js and lib/format.js', async () => {
    const code = "export const k = n => String(n).padStart(2, '0')\n"
    expect(await lint(code, 'src/lib/dates.js')).toEqual([])
    expect(await lint(code, 'src/lib/format.js')).toEqual([])
  })

  it('exempts only lib/plans/scenarios.js, which is UTC on purpose', async () => {
    const code = 'export const k = date => date.toISOString().slice(0, 10)\n'
    expect(await lint(code, 'src/lib/plans/scenarios.js')).toEqual([])
    expect(await lint(code, 'src/lib/plans/other.js')).toHaveLength(1)
  })
})
