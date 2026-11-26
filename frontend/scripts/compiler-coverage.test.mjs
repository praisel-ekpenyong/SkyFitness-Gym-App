import reactCompilerModule from 'babel-plugin-react-compiler'
import { transformSync } from '@babel/core'
import { describe, expect, it } from 'vitest'

// Babel 8 drops memoization for components with destructured default props;
// this guard keeps the build on a compiler combination that still compiles them.
const reactCompiler = reactCompilerModule.default ?? reactCompilerModule

function compile(code) {
  return transformSync(code, {
    filename: 'Fixture.jsx',
    configFile: false,
    babelrc: false,
    parserOpts: { plugins: ['jsx'] },
    plugins: [[reactCompiler, {}]],
  }).code
}

describe('React Compiler coverage', () => {
  it('compiles a component whose props have a destructured default', () => {
    const code = compile("export function Card({ title = 'Hi' }) { return <div>{title}</div> }")
    expect(code).toContain('react/compiler-runtime')
    expect(code).toMatch(/const \$ = _c\(/)
  })

  it('compiles a component without default props too', () => {
    const code = compile('export function Card({ title }) { return <div>{title}</div> }')
    expect(code).toContain('react/compiler-runtime')
    expect(code).toMatch(/const \$ = _c\(/)
  })
})
