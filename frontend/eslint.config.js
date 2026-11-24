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

// Single-owner formatting (CODING_STANDARDS.md): time is formatted only in lib/format.js and lib/dates.js.
const noModulo60 = {
  selector: "BinaryExpression[operator='%'][right.value=60]",
  message: 'Format durations and times through lib/format.js or lib/dates.js, not `% 60`.',
}

// oxlint is the main linter (.oxlintrc.json, ADR 0034) and owns every rule it supports:
// its correctness category, rules-of-hooks, exhaustive-deps, no-unused-vars, no-empty.
// ESLint keeps only what oxlint cannot do: the react-hooks compiler rules and
// no-restricted-syntax selectors. A rule runs in one tool, never two.

// CODING_STANDARDS.md "Modern ESM": oxlint bans the CommonJS globals; this bans shims named
// after them. A later block that sets no-restricted-syntax replaces the earlier options,
// so every such block must list this selector again.
const noCommonJsShim = {
  selector: 'VariableDeclarator[id.name=/^(__dirname|__filename|require)$/]',
  message: 'Do not shim CommonJS globals. Use import.meta.dirname, import.meta.filename or import.meta.url.',
}

// One owner per derived value: the unit fallback. PROFILE_CLEAN cleans S.unit on the way in.
const noKgFallback = {
  selector: "LogicalExpression[right.value='kg']",
  message: "No `|| 'kg'` fallback: S.unit is cleaned by PROFILE_CLEAN; other units go through lib/units.js (sanitizeUnit, entryUnit).",
}

// src/ selectors and the files that own each one. A later block's no-restricted-syntax
// replaces the earlier options, so srcRestrictedSyntax gives every src file one block
// with every selector except those its owner exemptions drop. Exempt patterns must not overlap.
const SRC_TESTS = 'src/**/*.test.{js,jsx,mjs}'
const srcSelectors = [
  { selector: noCommonJsShim, exempt: [] },
  { selector: noModulo60, exempt: ['src/lib/format.js', 'src/lib/dates.js'] },
  // The 18 existing hits are baselined in eslint-suppressions.json.
  { selector: noKgFallback, exempt: ['src/lib/units.js'] },
  // Allowlist: Vite build flags, not configuration.
  // useStore.js: import.meta.env.MODE turns on Immer's auto-freeze in tests only.
  // Modals.jsx: import.meta.env.DEV throws on a bad modal call in development only.
  { selector: importMetaEnv, exempt: ['src/lib/env.js', SRC_TESTS, 'src/store/useStore.js', 'src/components/Modals.jsx'] },
  { selector: processEnv, exempt: ['src/lib/env.js', SRC_TESTS] },
]

function srcRestrictedSyntax() {
  const block = (files, pattern) => ({
    files,
    rules: {
      'no-restricted-syntax': ['error', ...srcSelectors.filter(s => !s.exempt.includes(pattern)).map(s => s.selector)],
    },
  })
  const owners = [...new Set(srcSelectors.flatMap(s => s.exempt))]
  return [block(['src/**/*.{js,jsx,mjs}']), ...owners.map(pattern => block([pattern], pattern))]
}

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
      'no-restricted-syntax': ['error', noCommonJsShim],
    },
  },
  {
    // oxlint ignores tests, so its CommonJS-globals ban cannot see them. ESLint bans them here.
    files: ['**/*.test.*', '**/*.spec.*', 'src/test/**'],
    rules: {
      'no-restricted-globals': ['error', ...['__dirname', '__filename', 'require'].map(name => ({
        name,
        message: `${name} is CommonJS. Sky is ESM: use import.meta.dirname, import.meta.filename or import.meta.url.`,
      }))],
    },
  },
  ...srcRestrictedSyntax(),
]
