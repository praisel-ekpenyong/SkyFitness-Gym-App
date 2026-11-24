import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// oxlint is the main linter (.oxlintrc.json, ADR 0034) and owns every rule it supports:
// its correctness category, rules-of-hooks, exhaustive-deps, no-unused-vars, no-empty.
// ESLint keeps only what oxlint cannot do: the react-hooks compiler rules and
// no-restricted-syntax selectors. A rule runs in one tool, never two.
export default [
  { ignores: ['dist/', 'android/', 'ios/', 'public/', 'coverage/'] },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    // Zero-hit compiler rules. react-hooks/todo stays off. Do not spread
    // recommended: that also turns on rules-of-hooks, exhaustive-deps, and the
    // four rules that still hit (static-components, purity, refs, memo-dependencies).
    rules: {
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/no-deriving-state-in-effects': 'error',
      'react-hooks/set-state-in-render': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
      'react-hooks/globals': 'error',
    },
  },
]
