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
    // Compiler rules at error. react-hooks/todo stays off. Do not spread
    // recommended: that also turns on rules-of-hooks and exhaustive-deps.
    // static-components, purity, refs, and memo-dependencies still hit; those
    // hits are baselined in eslint-suppressions.json.
    rules: {
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/no-deriving-state-in-effects': 'error',
      'react-hooks/set-state-in-render': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
      'react-hooks/globals': 'error',
      'react-hooks/static-components': 'error',
      'react-hooks/purity': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/memo-dependencies': 'error',
    },
  },
  {
    // lib/ takes the clock as an argument. uid() in format.js and todayISO() in dates.js own the reads.
    // oxlint bans Date.now() there (.oxlintrc.json); this selector is the part it cannot do.
    files: ['src/lib/**/*.js'],
    ignores: ['src/lib/format.js', 'src/lib/dates.js', 'src/lib/**/*.test.js'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "NewExpression[callee.name='Date'][arguments.length=0]",
        message: 'lib/ takes the clock as an argument; new Date() reads it. Read the clock at the edge.',
      }],
    },
  },
]
