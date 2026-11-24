import { matchesGlob } from 'node:path'

// "One owner per derived value" (CODING_STANDARDS.md): no-restricted-syntax selectors that
// fail outside the owning module. Ratchet: eslint-suppressions.json.
// A file gets one config object per rule, so each owner's files run the other owners' selectors.
const unitsOwner = ['src/lib/units.js', 'src/lib/units.test.js']
const datesOwner = ['src/lib/dates.js', 'src/lib/dates.test.js']

const kgLb = 'lib/units.js (normalizeWeight)'
const lbSelectors = [
  { selector: "Identifier[name='LB_TO_KG']", message: `Convert kg and lb with ${kgLb}, never the factor.` },
  { selector: "Literal[value=2.2046]", message: `Convert kg and lb with ${kgLb}, never the factor.` },
  { selector: "Literal[value=0.4535]", message: `Convert kg and lb with ${kgLb}, never the factor.` },
  {
    selector: "BinaryExpression[operator='/'][right.value=10][left.callee.object.name='Math'][left.callee.property.name='round'][left.arguments.0.operator='*'][left.arguments.0.right.value=10]",
    message: 'Round to one decimal with round1 from lib/units.js, not Math.round(x * 10) / 10.',
  },
]
const weekdaySelectors = [
  {
    selector: "BinaryExpression[operator='%'][right.value=7][left.type='BinaryExpression'][left.operator='+'][left.right.value=6][left.left.callee.property.name='getDay']",
    message: 'Get the Monday-first weekday from lib/dates.js (mondayIndexOf), not (getDay() + 6) % 7.',
  },
]

const rule = selectors => ({ 'no-restricted-syntax': ['error', ...selectors] })

const owners = [
  { files: unitsOwner, own: [...weekdaySelectors] },
  { files: datesOwner, own: [...lbSelectors] },
]
const others = [...lbSelectors, ...weekdaySelectors]
// The One-owner selectors a non-owner file gets, for a file that needs its own rule list.
export const ownerSelectorsForOthers = others

/**
 * @param {object[]} [everywhere] - Selectors from other tickets that apply to every file.
 * @param {{files: string[], ignores?: string[], selectors: object[]}[]} [overrides] - File groups
 *   with extra selectors. Each also keeps the owner selectors, with the owner-file exemptions.
 */
export default (everywhere = [], overrides = []) => [
  { files: ['**/*.{js,jsx,mjs}'], ignores: [...unitsOwner, ...datesOwner], rules: rule([...everywhere, ...others]) },
  ...owners.map(o => ({ files: o.files, rules: rule([...everywhere, ...o.own]) })),
  ...overrides.flatMap(({ files, ignores = [], selectors }) => {
    const extra = [...everywhere, ...selectors]
    const ownerFiles = owners.flatMap(o => o.files.filter(f => !ignores.includes(f) && files.some(g => matchesGlob(f, g))))
    return [
      { files, ignores: [...ignores, ...unitsOwner, ...datesOwner], rules: rule([...extra, ...others]) },
      ...owners.flatMap(o => {
        const own = o.files.filter(f => ownerFiles.includes(f))
        return own.length ? [{ files: own, rules: rule([...extra, ...o.own]) }] : []
      }),
    ]
  }),
]
