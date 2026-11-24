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
    message: 'Get the Monday-first weekday from lib/dates.js (mondayOf), not (getDay() + 6) % 7.',
  },
]

const rule = selectors => ({ 'no-restricted-syntax': ['error', ...selectors] })

export default [
  { files: ['**/*.{js,jsx,mjs}'], ignores: [...unitsOwner, ...datesOwner], rules: rule([...lbSelectors, ...weekdaySelectors]) },
  { files: unitsOwner, rules: rule(weekdaySelectors) },
  { files: datesOwner, rules: rule(lbSelectors) },
]
