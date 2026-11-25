import { ESLint } from 'eslint'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const eslint = new ESLint({ cwd: root })

async function messages(code) {
  const [r] = await eslint.lintText(code, { filePath: join(root, 'src/fixture.jsx') })
  return r.messages.filter(m => m.ruleId === 'no-restricted-syntax')
}

describe('store selector and write rules', { timeout: 30000 }, () => {
  it.each([
    ['useStore()', 'const { S } = useStore()'],
    ['useUI()', 'const { closeSheet } = useUI()'],
    ['an object returned from a selector', 'const a = useStore(s => ({ x: s.S.x }))'],
    ['an array returned from a selector', 'const a = useStore(s => [s.S.x])'],
    ['a fallback [] in a selector', 'const a = useStore(s => s.S.active || [])'],
    ['a fallback {} in a selector', 'const a = useUI(s => s.map ?? {})'],
    ['a direct write to s.active', 'update(s => { s.active = null })'],
    ['a direct write to s.routines', 'update(s => { s.routines = [] })'],
    ['a write through another draft name', 'update(S => { S.active = null })'],
    ['a computed write', "update(s => { s['active'] = null })"],
    ['a write through the state slice', 'update(s => { s.S.active = null })'],
  ])('fails %s', async (_name, code) => {
    expect(await messages(code)).toHaveLength(1)
  })

  it.each([
    ['a slice', 'const u = useStore(s => s.S.unit)'],
    ['an action', 'const { } = 0; const f = useStore(s => s.update)'],
    ['a hoisted fallback', 'const E = []; const a = useStore(s => s.S.list || E)'],
  ])('passes %s', async (_name, code) => {
    expect(await messages(code)).toHaveLength(0)
  })
})
