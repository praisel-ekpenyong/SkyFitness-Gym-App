// Runtime-agnostic core of the i18n module: state and readers (t, dateLocale, instrFor).
// Plain Node-loadable — the browser-only pieces (the React subscription hook) live in i18n.js
// and re-export from here.
//
// Sky ships English only (ticket .scratch/sky/issues/05-english-only.md). The machinery stays
// because every user-visible string is already an English key wrapped in t() — dropping the
// indirection would touch hundreds of call sites for no behavior change. The non-English locale
// packs and instruction packs were deleted; re-introducing a language is a one-file change here.

let lang = 'en'                 // always 'en' now; kept so t()'s callers need no re-plumbing
let dict = {}                   // empty forever; t() falls through to the key itself
let instr = null                // null = English steps come from ex.st via instrFor
let version = 0                 // bumped on every setLang; drives the React subscription selector

export const dateLocale = () => 'en-GB'
export const getVersion = () => version

// Translate a source string; {0},{1}… are replaced with args (also on the English fallback).
export function t(s, ...args) {
  let v = dict[s] || s
  for (let i = 0; i < args.length; i++) v = v.replaceAll('{' + i + '}', args[i])
  return v
}

// Instructions for an exercise in the current language (English steps as fallback).
export const instrFor = ex => (instr && instr[ex.id]) || ex.st || []

// Called by i18n.js's setLang. Kept as a separate internal step so the runtime-agnostic half
// never imports Vite-only machinery. Returns the bumped version; every call lands on English.
export function _setLangState() {
  lang = 'en'
  dict = {}
  instr = null
  version++
  return version
}
