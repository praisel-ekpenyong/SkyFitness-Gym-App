import { join } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// The environment selectors in eslint.config.js (CODING_STANDARDS.md "Configuration").
const root = join(import.meta.dirname, '..')
const eslint = new ESLint({ cwd: root })

async function lint(code, path) {
  const [r] = await eslint.lintText(code, { filePath: join(root, path) })
  return r.messages.filter(m => m.ruleId === 'no-restricted-syntax')
}

// ESLint loads the whole config on first use, slow on a busy machine.
describe('environment selectors', { timeout: 60000 }, () => {
  it('fail an environment read in an ordinary src file', async () => {
    expect(await lint('export const a = import.meta.env.MODE\nexport const b = process.env.X\n', 'src/views/Fixture.jsx')).toHaveLength(2)
  })

  it.each([
    ['src/store/useStore.js', 'MODE', 'DEV'],
    ['src/components/Modals.jsx', 'DEV', 'MODE'],
  ])('let %s read import.meta.env.%s and nothing else', async (path, flag, other) => {
    expect(await lint(`export const a = import.meta.env.${flag}\n`, path)).toEqual([])
    for (const read of [other, 'VITE_X']) {
      expect(await lint(`export const a = import.meta.env.${read}\n`, path)).toHaveLength(1)
    }
  })

  it('let tests and the test harness read the environment', async () => {
    const code = 'export const a = import.meta.env.VITE_X\nexport const b = process.env.X\n'
    expect(await lint(code, 'src/views/Fixture.test.jsx')).toEqual([])
    expect(await lint(code, 'src/test/fixture.jsx')).toEqual([])
  })

  it('still run the other selectors in tests and the test harness', async () => {
    const code = "const __dirname = 1\nexport const a = s % 60\nexport const b = u || 'kg'\nvi.mock('./x.js')\n"
    expect(await lint(code, 'src/views/Fixture.test.jsx')).toHaveLength(4)
    expect(await lint(code, 'src/test/fixture.jsx')).toHaveLength(4)
  })
})
