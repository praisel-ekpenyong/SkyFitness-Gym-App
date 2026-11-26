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

  describe('UI tests find elements the way a lifter does', () => {
    const ui = 'src/views/sample.test.jsx'

    it.each([
      ['a class selector', "container.querySelector('.sheet')\n"],
      ['a nested class selector', "container.querySelectorAll('li .row')\n"],
      ['an id selector', "document.querySelector('#timer')\n"],
      ['a class attribute selector', "container.querySelector('[class~=done]')\n"],
      ['toHaveClass', "expect(button).toHaveClass('done')\n"],
      ['classList', "expect(button.classList.contains('done')).toBe(true)\n"],
      ['className', "expect(button.className).toContain('done')\n"],
    ])('fails %s in a .test.jsx', async (_name, code) => {
      expect(await messages(code, ui)).toHaveLength(1)
    })

    it.each([
      ['a role attribute selector', "container.querySelector('[role=\"checkbox\"]')\n"],
      ['a tag selector', "container.querySelector('button')\n"],
      ['a lookup by role', "within(container).getByRole('button', { name: 'Add note' })\n"],
    ])('passes %s in a .test.jsx', async (_name, code) => {
      expect(await messages(code, ui)).toHaveLength(0)
    })

    it('leaves a non-UI .test.js alone', async () => {
      expect(await messages("sheet.classList.add('open')\n", 'src/lib/sample.test.js')).toHaveLength(0)
    })
  })
})
