import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const eslint = new ESLint({ cwd: root })

async function lint(code, path = 'src/lib/sample.js') {
  const [r] = await eslint.lintText(code, { filePath: join(root, path) })
  return r.messages
}

const hit = 'export const k = date => date.toISOString().slice(0, 10)\n'

describe('disable comments (ADR 0034)', { timeout: 60000 }, () => {
  it.each([
    ['a next-line comment', `// eslint-disable-next-line no-restricted-syntax\n${hit}`],
    ['a file-wide block comment', `/* eslint-disable */\n${hit}`],
    ['a same-line comment', hit.replace('\n', ' // eslint-disable-line\n')],
  ])('%s does not hide the hit, and is itself reported', async (_, code) => {
    const messages = await lint(code)
    expect(messages.filter(m => m.ruleId === 'no-restricted-syntax')).toHaveLength(1)
    expect(messages.some(m => m.ruleId === null && /noInlineConfig/.test(m.message))).toBe(true)
  })

  it('reports an inline rule config in a test file too', async () => {
    const messages = await lint("/* eslint no-restricted-syntax: 'off' */\nexport const a = 1\n", 'src/lib/sample.test.js')
    expect(messages.some(m => /noInlineConfig/.test(m.message))).toBe(true)
  })
})
