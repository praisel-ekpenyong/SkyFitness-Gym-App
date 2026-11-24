import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import ownerSelectors from './eslint.owner-selectors.js'

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
  // Local dates, never UTC (CODING_STANDARDS.md "Local dates, never UTC"). A file gets one
  // no-restricted-syntax config, so these selectors ride in ownerSelectors with the One-owner ones.
  ...ownerSelectors([
    {
      selector: "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']",
      message: "toISOString() is UTC: build a day key with todayISO() or isoOf() from lib/dates.js.",
    },
    {
      selector: "NewExpression[callee.name='Date'][arguments.length=1] > :matches(MemberExpression[property.name='d'], Identifier[name='d'])",
      message: "new Date('YYYY-MM-DD') parses as UTC midnight: use parseDay() from lib/dates.js (local noon).",
    },
  ]),
  // lib/plans/scenarios.js, the dev scenario generator, is UTC end to end on purpose.
  { files: ['src/lib/plans/scenarios.js'], rules: { 'no-restricted-syntax': 'off' } },
]
