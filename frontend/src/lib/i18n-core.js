
let lang = 'en'
let dict = {}
let instr = null
let version = 0

/**
 * Reports the locale tag number and date formatting follow.
 * @returns {string} Always `en-GB`.
 */
export const dateLocale = () => 'en-GB'
/**
 * Reports the current language revision for React subscription reads.
 * @returns {number} Version counter bumped on every language state change.
 */
export const getVersion = () => version

/**
 * Translates a source string and fills `{0}`, `{1}`… in one pass, so an argument that holds
 * lifter text (a Routine's name) lands as typed instead of being substituted again.
 * @param {string} s English source string.
 * @param {...*} args Placeholder values.
 * @returns {string} The filled string.
 */
export function t(s, ...args) {
  return (dict[s] || s).replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m))
}

export const instrFor = ex => (instr && instr[ex.id]) || ex.st || []

export function _setLangState() {
  lang = 'en'
  dict = {}
  instr = null
  version++
  return version
}
