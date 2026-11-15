
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

export function t(s, ...args) {
  let v = dict[s] || s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return v
}

export const instrFor = ex => (instr && instr[ex.id]) || ex.st || []

export function _setLangState() {
  lang = 'en'
  dict = {}
  instr = null
  version++
  return version
}
