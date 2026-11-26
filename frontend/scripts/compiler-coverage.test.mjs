import { transformSync } from '@babel/core'
import { reactCompilerPreset } from '@vitejs/plugin-react'
import { describe, expect, it } from 'vitest'

// Babel 8 drops memoization for components with destructured default props.
// Use the same preset the Vite build uses, so a preset change cannot keep this green.
const preset = reactCompilerPreset().preset

function compile(code) {
  return transformSync(code, {
    filename: 'Fixture.jsx',
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ['jsx'] },
    presets: [preset],
  }).code
}

describe('React Compiler coverage', () => {
  it('compiles a component whose props have a destructured default', () => {
    const code = compile("export function Card({ title = 'Hi' }) { return <div>{title}</div> }")
    expect(code).toContain('react/compiler-runtime')
    expect(code).toMatch(/const \$ = _c\(/)
  })
})
