import { ESLint } from 'eslint'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const eslint = new ESLint({ cwd: root })

async function messages(code, file = 'src/lib/sample.test.js') {
  const [r] = await eslint.lintText(code, { filePath: join(root, file) })
  return r.messages.filter(m => m.ruleId === 'no-restricted-syntax')
}

describe('test guardrail selectors', { timeout: 30000 }, () => {
  it.each([
    ['toMatchSnapshot', "expect(view).toMatchSnapshot()\n"],
    ['toMatchInlineSnapshot', "expect(view).toMatchInlineSnapshot(`'x'`)\n"],
    ['toMatchFileSnapshot', "await expect(view).toMatchFileSnapshot('out.txt')\n"],
    ['toThrowErrorMatchingSnapshot', "expect(() => run()).toThrowErrorMatchingSnapshot()\n"],
    ['toThrowErrorMatchingInlineSnapshot', "expect(() => run()).toThrowErrorMatchingInlineSnapshot(`'err'`)\n"],
    ['static import of active-finish.js', "import { buildCompletedWorkout } from './active-finish.js'\n"],
    ['static import of active-act.js', "import { act } from '../lib/active-act.js'\n"],
    ['dynamic import of active-session.js', "const m = await import('./active-session.js')\n"],
  ])('fails %s in tests', async (_name, code) => {
    expect(await messages(code)).toHaveLength(1)
  })

  it.each([
    ['public active-workout.js seam', "import { act, sessionView } from './active-workout.js'\n"],
    ['explicit assertion instead of snapshot', "expect(view.textContent).toBe('Push')\n"],
  ])('passes %s in tests', async (_name, code) => {
    expect(await messages(code)).toHaveLength(0)
  })
})
