// Exercise search (ADR 0013): tokenising a query and matching tokens against an exercise's name,
// target, muscles, equipment and notes. The muscle taxonomy it reads stays in muscles.js.

import { EXIDX, smOf } from './exercises.js'
import { MUSCLE_NAME, canonicalMuscle, primaryMuscleOf, secondaryMusclesOf } from './muscles.js'

/**
 * @typedef {{
 *   primary: string | null,
 *   secondaries: string[],
 *   primaryName: string,
 *   rawSm: string[],
 * }} ExerciseSearchContext
 */

/** @typedef {import('./types.js').CustomExercise & { notes?: string }} SearchableExercise */

export const SEARCH_STOP_WORDS = new Set(['with', 'on', 'in', 'for', 'the', 'to', 'at', 'and', 'or', 'a', 'an'])

/**
 * @param {string | null | undefined} query
 * @returns {string[]}
 */
export function tokenizeSearchQuery(query) {
  const normalized = String(query || '')
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase()
    .trim()
  if (!normalized) return []
  const rawTokens = normalized.split(/\s+/).filter(Boolean)
  const filtered = rawTokens.filter(t => !SEARCH_STOP_WORDS.has(t) && (t.length > 1 || /\d/.test(t)))
  return filtered.length > 0 ? filtered : rawTokens
}

/**
 * @param {unknown} str
 * @param {string | null | undefined} token
 * @returns {boolean}
 */
export function stringIncludesToken(str, token) {
  if (!str || !token) return false
  const s = String(str).toLowerCase()
  const t = String(token).toLowerCase()
  if (/^\d+$/.test(t)) {
    return new RegExp(`(?<!\\d)${t}(?!\\d)`).test(s)
  }
  return s.includes(t)
}

/**
 * @param {SearchableExercise | null | undefined} ex
 * @returns {ExerciseSearchContext | null}
 */
export function exerciseContext(ex) {
  if (!ex || typeof ex !== 'object') return null
  const primary = primaryMuscleOf(ex)
  const secondaries = secondaryMusclesOf(ex)
  const primaryName = (primary && MUSCLE_NAME[primary]) || ''
  const rawSm = smOf(ex)
  return { primary, secondaries, primaryName, rawSm }
}

/**
 * Checks whether a single token matches an exercise across any of its attributes.
 *
 * @param {string} token - Query token to match.
 * @param {SearchableExercise | null | undefined} ex - Exercise object.
 * @param {ExerciseSearchContext | string | null} [ctx] - Precomputed exerciseContext(ex) to eliminate repeated derivations.
 * @returns {boolean}
 */
export function tokenMatchesExercise(token, ex, ctx) {
  if (!token || !ex) return false
  /** @type {ExerciseSearchContext | null} */
  const context = (ctx && typeof ctx === 'object' && !Array.isArray(ctx) && 'primary' in ctx)
    ? ctx
    : (typeof ctx === 'string'
      ? { primary: arguments[2], secondaries: arguments[3], primaryName: arguments[4], rawSm: arguments[5] }
      : exerciseContext(ex))
  const { primary: p, secondaries: s, primaryName: pName, rawSm: sm } = context || {}
  const t = token.toLowerCase()
  const tokenSlug = canonicalMuscle(t)
  if (tokenSlug) {
    if (p === tokenSlug) return true
    if (s && s.includes(tokenSlug)) return true
  }
  if (stringIncludesToken(ex.n, t)) return true
  if (stringIncludesToken(ex.tg, t)) return true
  if (p && stringIncludesToken(p, t)) return true
  if (pName && stringIncludesToken(pName, t)) return true
  if (s && s.some(m => stringIncludesToken(m, t) || stringIncludesToken(MUSCLE_NAME[m], t))) return true
  if (sm && sm.some(raw => stringIncludesToken(raw, t))) return true
  if (stringIncludesToken(ex.eq, t)) return true
  if (stringIncludesToken(ex.bp, t)) return true
  if (stringIncludesToken(ex.desc || ex.notes, t)) return true
  return false
}

/**
 * @param {string | SearchableExercise} idOrEx
 * @param {string} query
 * @returns {string | null}
 */
export function secondaryMatchForQuery(idOrEx, query) {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return null
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return null
  const ctx = exerciseContext(ex)
  if (!ctx) return null
  const { primary, primaryName, secondaries, rawSm } = ctx
  const titleLower = String(ex.n || '').toLowerCase()
  const tgLower = String(ex.tg || '').toLowerCase()
  const primaryLower = String(primary || '').toLowerCase()
  const primaryNameLower = String(primaryName || '').toLowerCase()

  for (const token of tokens) {
    const t = token.toLowerCase()
    const matchesTitle = stringIncludesToken(titleLower, t)
    const tokenSlug = canonicalMuscle(t)
    const matchesPrimary = (tokenSlug && tokenSlug === primary) ||
      stringIncludesToken(tgLower, t) ||
      stringIncludesToken(primaryLower, t) ||
      stringIncludesToken(primaryNameLower, t)

    if (matchesTitle || matchesPrimary) {
      continue
    }

    if (tokenSlug && secondaries.includes(tokenSlug)) {
      return tokenSlug
    }
    const matchedSlug = secondaries.find(m =>
      stringIncludesToken(m, t) || stringIncludesToken(MUSCLE_NAME[m] || '', t)
    )
    if (matchedSlug) return matchedSlug

    const matchedRaw = rawSm.find(s => stringIncludesToken(s, t))
    if (matchedRaw) {
      const slug = canonicalMuscle(matchedRaw)
      if (slug && slug !== primary) return slug
    }
  }

  return null
}

/**
 * @param {string | SearchableExercise} idOrEx
 * @param {string} query
 * @returns {boolean}
 */
export function matchesExerciseSearch(idOrEx, query) {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return true
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return false
  const ctx = exerciseContext(ex)
  return tokens.some(token => tokenMatchesExercise(token, ex, ctx))
}
