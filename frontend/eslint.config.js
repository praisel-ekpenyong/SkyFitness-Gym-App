import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// CODING_STANDARDS.md "Configuration": read the environment only in lib/env.js.
const importMetaEnv = {
  selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
  message: 'Read import.meta.env only in lib/env.js (validateEnv); use env.* instead.',
}
const processEnv = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Read process.env only in lib/env.js (validateEnv); use env.* instead.',
}

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
    files: ['src/**/*.{js,jsx,mjs}'],
    ignores: ['src/lib/env.js', '**/*.test.{js,jsx,mjs}'],
    rules: { 'no-restricted-syntax': ['error', importMetaEnv, processEnv] },
  },
  // Allowlist: Vite build flags, not configuration.
  // useStore.js: import.meta.env.MODE turns on Immer's auto-freeze in tests only.
  // Modals.jsx: import.meta.env.DEV throws on a bad modal call in development only.
  {
    files: ['src/store/useStore.js', 'src/components/Modals.jsx'],
    rules: { 'no-restricted-syntax': ['error', processEnv] },
  },
]
