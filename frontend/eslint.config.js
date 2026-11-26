import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { matchesGlob, relative, sep } from 'node:path'


const importMetaEnv = {
  selector: "MemberExpression[object.type='MetaProperty'][property.name='env']",
  message: 'Read import.meta.env only in lib/env.js (validateEnv); use env.* instead.',
}
const importMetaEnvExcept = flag => ({
  selector: `${importMetaEnv.selector}:not(MemberExpression[property.name='${flag}'][computed=false] > MemberExpression.object)`,
  message: `Only import.meta.env.${flag} is allowed here. Read any other setting in lib/env.js (validateEnv).`,
})
const processEnv = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Read process.env only in lib/env.js (validateEnv); use env.* instead.',
}

const noModulo60 = {
  selector: "BinaryExpression[operator='%'][right.value=60]",
  message: 'Format durations and times through lib/format.js or lib/dates.js, not `% 60`.',
}

const noCommonJsShim = {
  selector: 'VariableDeclarator[id.name=/^(__dirname|__filename|require)$/]',
  message: 'Do not shim CommonJS globals. Use import.meta.dirname, import.meta.filename or import.meta.url.',
}

const noKgFallback = {
  selector: "LogicalExpression[right.value='kg']",
  message: "No `|| 'kg'` fallback: S.unit is cleaned by PROFILE_CLEAN; other units go through lib/units.js (sanitizeUnit, entryUnit).",
}

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
const DAY_KEY_SYNTAX = [{
  selector: "CallExpression[callee.property.name='padStart'][arguments.0.value=2][arguments.1.value='0']",
  message: 'Build a day key with todayISO() or isoOf(), and a month key with monthKey(), from lib/dates.js; never pad by hand.',
}]
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
const CLOCK_SYNTAX = [{
  selector: "NewExpression[callee.name='Date'][arguments.length=0]",
  message: 'lib/ takes the clock as an argument; new Date() reads it. Read the clock at the edge.',
}]
const DIRECT_PROTECTED_WRITE = [
  {
    selector: "AssignmentExpression[left.type='MemberExpression'][left.property.name=/^(active|routines)$/]",
    message: 'Only lib/ and store/ assign .active or .routines; call a named store entry point instead.',
  },
  {
    selector: "AssignmentExpression[left.type='MemberExpression'][left.computed=true][left.property.value=/^(active|routines)$/]",
    message: 'Only lib/ and store/ assign .active or .routines; call a named store entry point instead.',
  },
]

// `\x2F` is a slash: an esquery regex cannot contain one.
const noOwnModuleMock = {
  selector: "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/][arguments.0.value=/^\\.(?!.*platform\\x2F)/]",
  message: 'Do not vi.mock our own modules; mock only the boundary (platform/, localStorage, Capacitor).',
}
const noTestSnapshots = {
  selector: 'CallExpression[callee.property.name=/^(toMatch(Inline|File)?|toThrowErrorMatching(Inline)?)Snapshot$/]',
  message: 'Do not use snapshot tests (TESTING_STANDARDS.md); assert observable behaviour instead.',
}
const noActiveInternalImports = {
  selector: ':matches(ImportDeclaration, ImportExpression)[source.value=/^\\..*active-(act|finish|session|sets|toggle)(\\.js)?$/]',
  message: 'Import act and sessionView from lib/active-workout.js, not lib/active-* internals (ADR 0023, TESTING_STANDARDS.md).',
}

const TESTS = ['**/*.test.*', '**/*.spec.*', 'src/test/**']
const SOURCE = '**/*.{js,jsx,mjs}'
const SRC = 'src/**/*.{js,jsx,mjs}'

const restrictedSyntax = [
  { selectors: [noCommonJsShim] },
  { selectors: UTC_SYNTAX, exempt: ['src/lib/plans/scenarios.js'] },
  { selectors: STORE_SYNTAX },
  { selectors: DIRECT_PROTECTED_WRITE, files: [SRC], exempt: ['src/lib/**', 'src/store/**', ...TESTS] },
  { selectors: DAY_KEY_SYNTAX, files: [SRC], exempt: ['src/lib/dates.js', 'src/lib/format.js', ...TESTS] },
  { selectors: LB_SYNTAX, exempt: ['src/lib/units.js', 'src/lib/units.test.js'] },
  { selectors: WEEKDAY_SYNTAX, exempt: ['src/lib/dates.js', 'src/lib/dates.test.js'] },
  { selectors: CLOCK_SYNTAX, files: ['src/lib/**/*.js'], exempt: ['src/lib/format.js', 'src/lib/dates.js', ...TESTS] },
  { selectors: [noModulo60], files: [SRC], exempt: ['src/lib/format.js', 'src/lib/dates.js'] },
  { selectors: [noKgFallback], files: [SRC], exempt: ['src/lib/units.js'] },
  { selectors: [importMetaEnv], files: [SRC], exempt: ['src/lib/env.js', ...TESTS, 'src/store/useStore.js', 'src/components/Modals.jsx'] },
  { selectors: [importMetaEnvExcept('MODE')], files: ['src/store/useStore.js'] },
  { selectors: [importMetaEnvExcept('DEV')], files: ['src/components/Modals.jsx'] },
  { selectors: [processEnv], files: [SRC], exempt: ['src/lib/env.js', ...TESTS] },
  { selectors: [noOwnModuleMock, noTestSnapshots, noActiveInternalImports], files: TESTS },
]

// Flat config gives a file the options of the last block that sets a rule, so overlapping
function selectorsWhere(matches) {
  return restrictedSyntax
    .filter(({ files, exempt = [] }) => (!files || files.some(matches)) && !exempt.some(matches))
    .flatMap(r => r.selectors)
}
function restrictedSyntaxBlocks() {
  const all = restrictedSyntax.flatMap(r => r.selectors)
  const keyOf = list => list.map(s => all.indexOf(s)).join()
  const listOf = rel => selectorsWhere(p => matchesGlob(rel, p))
  const patterns = [...new Set(restrictedSyntax.flatMap(({ files = [], exempt = [] }) => [...files, ...exempt]))]
  const globs = patterns.filter(p => /[*?[{]/.test(p))
  const lists = patterns.filter(p => !globs.includes(p)).map(listOf)
  for (let bits = 0; bits < 2 ** globs.length; bits++) {
    lists.push(selectorsWhere(p => globs.includes(p) && (bits >> globs.indexOf(p)) & 1))
  }
  const blocks = new Map(lists.map(list => [keyOf(list), list]))
  // ESLint also asks a matcher about folders: only a source file gets a key. A file whose list
  const fileKeys = new Map()
  const fileKey = filePath => {
    if (!fileKeys.has(filePath)) {
      const rel = relative(import.meta.dirname, filePath).split(sep).join('/')
      const key = matchesGlob(rel, SOURCE) ? keyOf(listOf(rel)) : null
      if (key !== null && !blocks.has(key)) throw new Error(`eslint.config.js: no no-restricted-syntax block for ${rel}`)
      fileKeys.set(filePath, key)
    }
    return fileKeys.get(filePath)
  }
  return [...blocks].map(([key, list]) => ({
    files: [filePath => fileKey(filePath) === key],
    rules: { 'no-restricted-syntax': ['error', ...list] },
  }))
}

export default [
  { ignores: ['dist/', 'android/', 'ios/', 'public/', 'coverage/', 'scripts/fixtures/eslint-selectors/**'] },
  // A disable comment never hides a hit (ADR 0034): inline config is off, and `npm run lint` fails on the warning it leaves.
  { linterOptions: { noInlineConfig: true } },
  {
    files: [SOURCE],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
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
