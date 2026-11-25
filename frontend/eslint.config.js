import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { matchesGlob, relative, sep } from 'node:path'

// oxlint is the main linter (.oxlintrc.json, ADR 0034) and owns every rule it supports:
// its correctness category, rules-of-hooks, exhaustive-deps, no-unused-vars, no-empty.
// ESLint keeps only what oxlint cannot do: the react-hooks compiler rules and
// no-restricted-syntax selectors. A rule runs in one tool, never two.

// CODING_STANDARDS.md "Configuration": read the environment only in lib/env.js.
const importMetaEnv = {
  selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
  message: 'Read import.meta.env only in lib/env.js (validateEnv); use env.* instead.',
}
// import.meta.env with one named Vite build flag allowed: any other read still fails.
const importMetaEnvExcept = flag => ({
  selector: `${importMetaEnv.selector}:not(MemberExpression[property.name='${flag}'][computed=false] > MemberExpression.object)`,
  message: `Only import.meta.env.${flag} is allowed here. Read any other setting in lib/env.js (validateEnv).`,
})
const processEnv = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Read process.env only in lib/env.js (validateEnv); use env.* instead.',
}

// Single-owner formatting (CODING_STANDARDS.md): time is formatted only in lib/format.js and lib/dates.js.
const noModulo60 = {
  selector: "BinaryExpression[operator='%'][right.value=60]",
  message: 'Format durations and times through lib/format.js or lib/dates.js, not `% 60`.',
}

// CODING_STANDARDS.md "Modern ESM": oxlint bans the CommonJS globals; this bans shims named after them.
const noCommonJsShim = {
  selector: 'VariableDeclarator[id.name=/^(__dirname|__filename|require)$/]',
  message: 'Do not shim CommonJS globals. Use import.meta.dirname, import.meta.filename or import.meta.url.',
}

// One owner per derived value: the unit fallback. PROFILE_CLEAN cleans S.unit on the way in.
const noKgFallback = {
  selector: "LogicalExpression[right.value='kg']",
  message: "No `|| 'kg'` fallback: S.unit is cleaned by PROFILE_CLEAN; other units go through lib/units.js (sanitizeUnit, entryUnit).",
}

// One owner per derived value: kg and lb convert in lib/units.js, the weekday in lib/dates.js.
const kgLb = 'lib/units.js (normalizeWeight)'
const LB_SYNTAX = [
  { selector: "Identifier[name='LB_TO_KG']", message: `Convert kg and lb with ${kgLb}, never the factor.` },
  { selector: "Literal[value=2.2046]", message: `Convert kg and lb with ${kgLb}, never the factor.` },
  { selector: "Literal[value=0.4535]", message: `Convert kg and lb with ${kgLb}, never the factor.` },
  {
    selector: "BinaryExpression[operator='/'][right.value=10][left.callee.object.name='Math'][left.callee.property.name='round'][left.arguments.0.operator='*'][left.arguments.0.right.value=10]",
    message: 'Round to one decimal with round1 from lib/units.js, not Math.round(x * 10) / 10.',
  },
]
const WEEKDAY_SYNTAX = [
  {
    selector: "BinaryExpression[operator='%'][right.value=7][left.type='BinaryExpression'][left.operator='+'][left.right.value=6][left.left.callee.property.name='getDay']",
    message: 'Get the Monday-first weekday from lib/dates.js (mondayIndexOf), not (getDay() + 6) % 7.',
  },
]

// Local dates, never UTC (CODING_STANDARDS.md "Local dates, never UTC").
const UTC_SYNTAX = [
  {
    selector: "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString']",
    message: "toISOString() is UTC: build a day key with todayISO() or isoOf() from lib/dates.js.",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=1] > :matches(MemberExpression[property.name='d'], Identifier[name='d'])",
    message: "new Date('YYYY-MM-DD') parses as UTC midnight: use parseDay() from lib/dates.js (local noon).",
  },
]
// CODING_STANDARDS.md "The state caps", rule 3: subscribe to a slice; a selector returns no fresh [] or {}.
const STORE_SYNTAX = [
  {
    selector: 'CallExpression[callee.name=/^use(Store|UI)$/][arguments.length=0]',
    message: 'Subscribe to a slice: useStore(s => s.S.unit), useStore(s => s.update).',
  },
  {
    selector: 'CallExpression[callee.name=/^use(Store|UI)$/] > ArrowFunctionExpression > :matches(ObjectExpression, ArrayExpression, LogicalExpression[right.type=/^(Array|Object)Expression$/])',
    message: 'A selector returns no fresh [] or {}: hoist a const EMPTY or use useShallow.',
  },
]
// lib/ takes the clock as an argument. uid() in format.js and todayISO() in dates.js own the reads.
// oxlint bans Date.now() there (.oxlintrc.json); this selector is the part it cannot do.
const CLOCK_SYNTAX = [{
  selector: "NewExpression[callee.name='Date'][arguments.length=0]",
  message: 'lib/ takes the clock as an argument; new Date() reads it. Read the clock at the edge.',
}]

// TESTING_STANDARDS.md "Teeth": a test mocks only the boundary. The lookahead lets any
// relative path through platform/ pass; package mocks (Capacitor) are not relative.
// `\x2F` is a slash: an esquery regex cannot contain one.
const noOwnModuleMock = {
  selector: "CallExpression[callee.object.name='vi'][callee.property.name='mock'][arguments.0.value=/^\\.(?!.*platform\\x2F)/]",
  message: 'Do not vi.mock our own modules; mock only the boundary (platform/, localStorage, Capacitor).',
}

// Test files and the test harness, the same set for every rule that treats tests apart.
const TESTS = ['**/*.test.*', '**/*.spec.*', 'src/test/**']
const SOURCE = '**/*.{js,jsx,mjs}'
const SRC = 'src/**/*.{js,jsx,mjs}'

// Every no-restricted-syntax selector, with the files it runs in (default: every file) and
// the files exempt from it. Existing hits are baselined in eslint-suppressions.json.
const restrictedSyntax = [
  { selectors: [noCommonJsShim] },
  // lib/plans/scenarios.js, the dev scenario generator, is UTC end to end on purpose.
  { selectors: UTC_SYNTAX, exempt: ['src/lib/plans/scenarios.js'] },
  { selectors: STORE_SYNTAX },
  { selectors: LB_SYNTAX, exempt: ['src/lib/units.js', 'src/lib/units.test.js'] },
  { selectors: WEEKDAY_SYNTAX, exempt: ['src/lib/dates.js', 'src/lib/dates.test.js'] },
  { selectors: CLOCK_SYNTAX, files: ['src/lib/**/*.js'], exempt: ['src/lib/format.js', 'src/lib/dates.js', ...TESTS] },
  { selectors: [noModulo60], files: [SRC], exempt: ['src/lib/format.js', 'src/lib/dates.js'] },
  { selectors: [noKgFallback], files: [SRC], exempt: ['src/lib/units.js'] },
  { selectors: [importMetaEnv], files: [SRC], exempt: ['src/lib/env.js', ...TESTS, 'src/store/useStore.js', 'src/components/Modals.jsx'] },
  // Vite build flags, not configuration, one flag per file.
  // useStore.js: import.meta.env.MODE turns on Immer's auto-freeze in tests only.
  { selectors: [importMetaEnvExcept('MODE')], files: ['src/store/useStore.js'] },
  // Modals.jsx: import.meta.env.DEV throws on a bad modal call in development only.
  { selectors: [importMetaEnvExcept('DEV')], files: ['src/components/Modals.jsx'] },
  { selectors: [processEnv], files: [SRC], exempt: ['src/lib/env.js', ...TESTS] },
  { selectors: [noOwnModuleMock], files: TESTS },
]

// Flat config gives a file the options of the last block that sets a rule, so overlapping
// blocks would drop selectors. Instead each file's selector list is computed from the table,
// and there is one block per distinct list whose matcher accepts exactly the files with that
// list. The blocks are disjoint, so no block can win over another.
function selectorsWhere(matches) {
  return restrictedSyntax
    .filter(({ files, exempt = [] }) => (!files || files.some(matches)) && !exempt.some(matches))
    .flatMap(r => r.selectors)
}
function restrictedSyntaxBlocks() {
  const all = restrictedSyntax.flatMap(r => r.selectors)
  const keyOf = list => list.map(s => all.indexOf(s)).join()
  const listOf = rel => selectorsWhere(p => matchesGlob(rel, p))
  // Every list a file can get: a file named in the table gets its own; any other file matches
  // only glob patterns, so one of their combinations gives its list.
  const patterns = [...new Set(restrictedSyntax.flatMap(({ files = [], exempt = [] }) => [...files, ...exempt]))]
  const globs = patterns.filter(p => /[*?[{]/.test(p))
  const lists = patterns.filter(p => !globs.includes(p)).map(listOf)
  for (let bits = 0; bits < 2 ** globs.length; bits++) {
    lists.push(selectorsWhere(p => (bits >> globs.indexOf(p)) & 1))
  }
  // ESLint also asks a matcher about folders: only a source file gets a key.
  const fileKeys = new Map()
  const fileKey = filePath => {
    if (!fileKeys.has(filePath)) {
      const rel = relative(import.meta.dirname, filePath).split(sep).join('/')
      fileKeys.set(filePath, matchesGlob(rel, SOURCE) ? keyOf(listOf(rel)) : null)
    }
    return fileKeys.get(filePath)
  }
  return [...new Map(lists.map(list => [keyOf(list), list]))].map(([key, list]) => ({
    files: [filePath => fileKey(filePath) === key],
    rules: { 'no-restricted-syntax': ['error', ...list] },
  }))
}

export default [
  { ignores: ['dist/', 'android/', 'ios/', 'public/', 'coverage/'] },
  {
    files: [SOURCE],
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
    // oxlint ignores tests, so its CommonJS-globals ban cannot see them. ESLint bans them here.
    files: TESTS,
    rules: {
      'no-restricted-globals': ['error', ...['__dirname', '__filename', 'require'].map(name => ({
        name,
        message: `${name} is CommonJS. Sky is ESM: use import.meta.dirname, import.meta.filename or import.meta.url.`,
      }))],
    },
  },
  ...restrictedSyntaxBlocks(),
]
