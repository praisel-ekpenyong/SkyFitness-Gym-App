// Which muscles an exercise trains, and how hard — the data behind every muscle map.
//
// The exercise dataset names muscles in free text and is not consistent about it:
// "shoulders", "deltoids" and "delts" are the same thing, so are "quads" and
// "quadriceps", "lats" and "latissimus dorsi", "core" and "abdominals". Nineteen
// primary and forty secondary spellings collapse onto the nineteen muscles the body
// map can actually draw, via ALIAS below. Anything genuinely undrawable (hands,
// ankles, "cardiovascular system") maps to null and is dropped rather than guessed at.

import { doneWorkSets, hasWorkSet } from './workout-model.js'
import { EXIDX, smOf, isCardio, exerciseFor } from './exercises.js'
import { workoutTimestamp } from './format.js'

// The muscles a map can shade, in head-to-toe order — also the order of any list
// built from them, so "what am I neglecting" reads top-down like a body.
export const MUSCLES = [
  'trapezius', 'deltoids', 'chest', 'upper-back', 'lats', 'serratus',
  'biceps', 'triceps', 'forearm',
  'abs', 'obliques', 'lower-back',
  'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors',
  'calves', 'tibialis',
]

// Drawn as the silhouette, never shaded: they carry no training load.
export const INERT = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles']

// English display names; these strings are the i18n keys (see lib/i18n.js).
export const MUSCLE_NAME = {
  trapezius: 'Traps', deltoids: 'Shoulders', chest: 'Chest', 'upper-back': 'Upper back',
  lats: 'Lats', serratus: 'Serratus', biceps: 'Biceps', triceps: 'Triceps', forearm: 'Forearms',
  abs: 'Abs', obliques: 'Obliques', 'lower-back': 'Lower back', gluteal: 'Glutes',
  quadriceps: 'Quads', hamstring: 'Hamstrings', adductors: 'Adductors',
  'hip-flexors': 'Hip flexors', calves: 'Calves', tibialis: 'Shins',
  cardio: 'Cardio',
}

// Filter taxonomy: the 19 canonical anatomical muscle groups in head-to-toe order plus cardio.
export const FILTER_MUSCLES = [...MUSCLES, 'cardio']

// Mapping from canonical muscle slug (or cardio) to legacy body part string.
const MUSCLE_TO_BODYPART = {
  trapezius: 'neck',
  deltoids: 'shoulders',
  chest: 'chest',
  'upper-back': 'back',
  lats: 'back',
  serratus: 'chest',
  biceps: 'upper arms',
  triceps: 'upper arms',
  forearm: 'lower arms',
  abs: 'waist',
  obliques: 'waist',
  'lower-back': 'back',
  gluteal: 'upper legs',
  quadriceps: 'upper legs',
  hamstring: 'upper legs',
  adductors: 'upper legs',
  'hip-flexors': 'upper legs',
  calves: 'lower legs',
  tibialis: 'lower legs',
  cardio: 'cardio',
}

// Every spelling that occurs in the dataset's `tg` and `sm` fields. null = not drawable.
const ALIAS = {
  // primaries
  abs: 'abs', pectorals: 'chest', biceps: 'biceps', glutes: 'gluteal', delts: 'deltoids',
  triceps: 'triceps', 'upper back': 'upper-back', lats: 'lats', calves: 'calves',
  quads: 'quadriceps', forearms: 'forearm', hamstrings: 'hamstring', spine: 'lower-back',
  traps: 'trapezius', adductors: 'adductors', 'serratus anterior': 'serratus',
  abductors: 'gluteal', 'levator scapulae': 'trapezius', 'cardiovascular system': null,
  // secondaries
  shoulders: 'deltoids', deltoids: 'deltoids', 'rear deltoids': 'deltoids',
  'rotator cuff': 'deltoids', quadriceps: 'quadriceps', core: 'abs', abdominals: 'abs',
  'lower abs': 'abs', chest: 'chest', 'upper chest': 'chest', 'hip flexors': 'hip-flexors',
  obliques: 'obliques', 'lower back': 'lower-back', rhomboids: 'upper-back',
  trapezius: 'trapezius', back: 'upper-back', 'latissimus dorsi': 'lats', latissimus: 'lats',
  brachialis: 'biceps', soleus: 'calves', shins: 'tibialis', wrists: 'forearm',
  'wrist flexors': 'forearm', 'wrist extensors': 'forearm', 'grip muscles': 'forearm',
  groin: 'adductors', 'inner thighs': 'adductors',
  ankles: null, feet: null, hands: null, 'ankle stabilizers': null,
  sternocleidomastoid: null,
}
// Custom exercises carry only a body part, so they fall back to it. Weights inside a
// group sum to 1 — "upper legs" spreads over three muscles rather than counting triple.
// Back splits across three muscles with editorial weights lats 0.50 / upper-back 0.35 / lower-back 0.15.
const BY_BODYPART = {
  chest: { chest: 1 },
  back: { lats: 0.50, 'upper-back': 0.35, 'lower-back': 0.15 },
  shoulders: { deltoids: 1 },
  'upper arms': { biceps: 0.5, triceps: 0.5 },
  'lower arms': { forearm: 1 },
  waist: { abs: 0.7, obliques: 0.3 },
  'upper legs': { quadriceps: 0.4, hamstring: 0.35, gluteal: 0.25 },
  'lower legs': { calves: 0.8, tibialis: 0.2 },
  neck: { trapezius: 1 },
  cardio: {},
}
const SECONDARY = 0.4   // a supporting muscle counts this much against a primary

/**
 * Wraps a muscle field onto the array form group matching reads.
 * @param {*} value - Array, single value, or missing input.
 * @returns {Array} The array itself, a one-item wrapper, or an empty array for nullish or empty-string input.
 */
const arrayOf = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value]

// Direct (or legacy single-field) muscle metadata stamped on the outer object itself.
const hasDirectMuscleMeta = ex => !!ex && typeof ex === 'object' && (
  ['muscleGroups', 'muscles', 'targetMuscles'].some(key => Object.prototype.hasOwnProperty.call(ex, key))
  || [ex.tg, ex.mg, ...arrayOf(ex.sm)].some(value => value != null && value !== '')
)

// Completed history entries may retain a nested snapshot after their custom exercise is
// deleted from the profile catalogue. Prefer that snapshot when the outer entry has no muscle
// metadata of its own, while keeping direct/legacy entry fields authoritative when present.
function metadataOf(ex) {
  if (!ex || typeof ex !== 'object') return ex
  return !hasDirectMuscleMeta(ex) && ex.muscleSnapshot && typeof ex.muscleSnapshot === 'object' && !Array.isArray(ex.muscleSnapshot)
    ? ex.muscleSnapshot
    : ex
}

// Muscle metadata the entry owns itself — direct/legacy fields or logged weights — as opposed
// to a nested `muscleSnapshot`, which is only the entry's last-resort copy of it.
const hasOwnMuscleMeta = ex =>
  hasDirectMuscleMeta(ex) || (!!ex && typeof ex === 'object' && ex.muscleWeights
    && typeof ex.muscleWeights === 'object' && !Array.isArray(ex.muscleWeights)
    && Object.keys(ex.muscleWeights).length > 0)

/**
 * Muscle weights one logged entry trains: the entry's own metadata when present, else the
 * live catalogue, else the entry itself with its nested `muscleSnapshot` unwrapped.
 *
 * The one precedence every muscle surface reads — body map, fatigue, strength, exercise
 * rows — so a deleted custom keeps counting through its snapshot and a live one reads its
 * current catalogue metadata.
 *
 * @param {Object|null|undefined} entry - Workout entry with id and/or embedded exercise or snapshot.
 * @returns {Record<string, number>} Muscle weights by slug, { slug: 0…1 }.
 */
export function muscleWeightsOf(entry) {
  const source = entry && typeof entry === 'object' ? entry : null
  if (!source) return {}
  return hasOwnMuscleMeta(source) ? musclesOf(source) : musclesOf(exerciseFor(source))
}

/**
 * Reads the explicitly assigned muscle groups off an exercise, if it carries any.
 * @param {Object} ex - Exercise that may carry `muscleGroups`, `muscles`, or `targetMuscles`; non-objects yield null.
 * @returns {string[]|null} Group list in stored form, or null when the exercise names no explicit groups.
 */
function explicitGroupsOf(ex) {
  if (!ex || typeof ex !== 'object') return null
  if (Object.prototype.hasOwnProperty.call(ex, 'muscleGroups')) {
    const groups = arrayOf(ex.muscleGroups)
    return groups.length ? groups : null
  }
  if (Object.prototype.hasOwnProperty.call(ex, 'muscles')) {
    const groups = arrayOf(ex.muscles)
    return groups.length ? groups : null
  }
  if (Object.prototype.hasOwnProperty.call(ex, 'targetMuscles')) {
    const groups = arrayOf(ex.targetMuscles)
    return groups.length ? groups : null
  }
  return null
}

/** True only when the catalogue explicitly supplied muscle groups, not a body-part fallback. */
export function hasExplicitMuscleMetadata(ex) {
  const source = metadataOf(ex)
  if (!source || typeof source !== 'object') return false
  const groups = explicitGroupsOf(source)
  if (groups && groups.some(value => canonicalMuscle(value))) return true
  return [source.tg, source.mg, ...arrayOf(source.sm)].some(value => canonicalMuscle(value))
}

/**
 * Resolves any muscle spelling onto the slug the body map draws.
 * @param {string} value - Muscle name, alias, slug, or cardio; blank or undrawable yields null.
 * @returns {string|null} Canonical slug such as `quadriceps`, `cardio` for the cardiovascular system, or null when unknown.
 */
export function canonicalMuscle(value) {
  const name = String(value || '').toLowerCase().trim()
  if (name === 'cardio' || name === 'cardiovascular system') return 'cardio'
  if (MUSCLES.includes(name)) return name
  return ALIAS[name] || null
}

/** Resolves any input (name, alias, slug) to a canonical slug with safe fallback string. */
export function resolveMuscleSlug(value) {
  const slug = canonicalMuscle(value)
  if (slug) return slug
  return String(value || '').toLowerCase().trim() || null
}

/** Derive legacy coarse body part from a canonical muscle group or cardio. */
export function bodypartForMuscle(muscle) {
  const slug = resolveMuscleSlug(muscle)
  return MUSCLE_TO_BODYPART[slug] || (BY_BODYPART[slug] ? slug : 'chest')
}

/** Primary muscle slug for an exercise (canonical anatomical muscle group or 'cardio'). */
export function primaryMuscleOf(idOrEx) {
  const raw = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  const ex = hasOwnMuscleMeta(raw) ? raw : (exerciseFor(raw) || raw)
  if (!ex || typeof ex !== 'object') return null
  const source = metadataOf(ex)
  if (isCardio(source)) return 'cardio'
  const explicit = explicitGroupsOf(source)
  if (explicit && explicit.length > 0) {
    const first = canonicalMuscle(explicit[0])
    if (first) return first
  }
  if (source.tg) {
    const slug = canonicalMuscle(source.tg)
    if (slug) return slug
  }
  const bpMuscles = Object.keys(BY_BODYPART[source.bp] || {})
  return bpMuscles[0] || null
}

/** Secondary supporting muscle slugs for an exercise (canonical anatomical muscle groups). */
export function secondaryMusclesOf(idOrEx) {
  const raw = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  const ex = hasOwnMuscleMeta(raw) ? raw : (exerciseFor(raw) || raw)
  if (!ex || typeof ex !== 'object') return []
  const source = metadataOf(ex)
  if (isCardio(source)) return []
  const primary = primaryMuscleOf(source)
  const explicit = explicitGroupsOf(source)
  const out = []
  const add = val => {
    const slug = canonicalMuscle(val)
    if (slug && slug !== 'cardio' && slug !== primary && !out.includes(slug)) {
      out.push(slug)
    }
  }
  if (explicit) {
    explicit.slice(1).forEach(add)
    return out
  }
  const rawSm = smOf(source)
  const hasSm = Array.isArray(source.sm) ? source.sm.length > 0 : source.sm != null
  const hasMg = source.mg != null
  if (source.tg || hasSm || hasMg || rawSm.length > 0) {
    if (source.mg) add(source.mg)
    rawSm.forEach(add)
    return out
  }
  // Fallback for legacy custom exercises that have only bp and no explicit tg/sm
  if (!source.tg && source.bp && BY_BODYPART[source.bp]) {
    Object.keys(BY_BODYPART[source.bp]).forEach(add)
  }
  return out
}

/** True when an exercise trains the requested muscle filter (as primary or secondary) or cardio. */
export function matchesMuscleFilter(idOrEx, filter) {
  if (!filter) return true
  const target = resolveMuscleSlug(filter)
  if (!target) return true
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return false
  if (target === 'cardio') {
    return ex.bp === 'cardio' || primaryMuscleOf(ex) === 'cardio'
  }
  const primary = primaryMuscleOf(ex)
  if (primary === target) return true
  const secondaries = secondaryMusclesOf(ex)
  if (secondaries.includes(target)) return true
  return false
}

/** True when the active muscle filter matched as a secondary target rather than primary. */
export function isSecondaryMuscleMatch(idOrEx, filter) {
  if (!filter || filter === 'cardio' || filter === 'favorites') return false
  const target = resolveMuscleSlug(filter)
  if (!target || target === 'cardio') return false
  const primary = primaryMuscleOf(idOrEx)
  if (primary === target) return false
  return secondaryMusclesOf(idOrEx).includes(target)
}

/** Common stop words stripped from catalogue search queries. */
export const SEARCH_STOP_WORDS = new Set(['with', 'on', 'in', 'for', 'the', 'to', 'at', 'and', 'or', 'a', 'an'])

/**
 * Tokenizes and normalizes a search query string.
 * Strips non-alphanumeric punctuation/hyphens, lowercases, filters stop words and 1-char noise.
 * Falls back to raw non-empty tokens if all tokens were filtered out.
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

/** Checks whether a string includes a token, respecting numeric boundaries for digit tokens. */
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
 * Computes derived muscle and attribute facts for an exercise to avoid
 * re-resolving them repeatedly across search tokens.
 *
 * @param {Object} ex - Exercise object.
 * @returns {Object|null} Derived context containing primary, secondaries, primaryName, and rawSm.
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
 * @param {Object} ex - Exercise object.
 * @param {Object} [ctx] - Precomputed exerciseContext(ex) to eliminate repeated derivations.
 * @returns {boolean}
 */
export function tokenMatchesExercise(token, ex, ctx) {
  if (!token || !ex) return false
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

/** Returns the secondary muscle that matched a search query when the query did not match the primary muscle or title. */
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

/** True when an exercise matches a search query across names, muscles, aliases, and equipment. */
export function matchesExerciseSearch(idOrEx, query) {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return true
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return false
  const ctx = exerciseContext(ex)
  return tokens.some(token => tokenMatchesExercise(token, ex, ctx))
}


/** Canonical unique muscle groups, accepting both new arrays and legacy single fields. */
export function muscleGroupsOf(ex) {
  const sourceEx = metadataOf(ex)
  const explicit = explicitGroupsOf(sourceEx)
  const source = explicit || [sourceEx?.tg, sourceEx?.mg, ...arrayOf(smOf(sourceEx))]
  const out = []
  source.forEach(value => {
    const slug = canonicalMuscle(value)
    if (slug && MUSCLES.includes(slug) && !out.includes(slug)) out.push(slug)
  })
  if (!out.length && explicit == null) Object.keys(BY_BODYPART[sourceEx?.bp] || {}).forEach(slug => { if (!out.includes(slug)) out.push(slug) })
  return out
}

export const normalizeMuscleGroups = muscleGroupsOf

/** True when any requested group matches; an empty request is an intentionally unfiltered query. */
export function matchesMuscleGroups(ex, requested) {
  const wanted = arrayOf(requested).map(canonicalMuscle).filter(Boolean)
  if (!wanted.length) return true
  const groups = new Set(muscleGroupsOf(ex))
  return wanted.some(group => groups.has(group))
}

/** Muscles one exercise trains: { slug: 0…1 }. Duplicate metadata never adds load twice. */
export function musclesOf(idOrEx) {
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return {}
  // Own weights (or direct/legacy fields) are authoritative even when a nested
  // `muscleSnapshot` is present; only unwrap the snapshot when the entry has nothing of its own.
  const sourceEx = hasOwnMuscleMeta(ex) ? ex : metadataOf(ex)
  if (sourceEx !== ex) return musclesOf(sourceEx)
  if (ex.muscleWeights && typeof ex.muscleWeights === 'object' && !Array.isArray(ex.muscleWeights)) {
    const snapshot = {}
    MUSCLES.forEach(slug => {
      const weight = Number(ex.muscleWeights[slug])
      if (Number.isFinite(weight) && weight > 0) snapshot[slug] = weight
    })
    if (Object.keys(snapshot).length) {
      // Historic reinterpret: old 2-way back snapshots (upper-back 0.75 / lower-back 0.25)
      // lack lats and were derived via BY_BODYPART fallback. Per spec 05, historic
      // workouts reinterpret live under the new 3-way split (no stored migration),
      // so stale snapshots must be ignored and re-derived via current BY_BODYPART.
      const isStaleBackSnapshot =
        !('lats' in snapshot) &&
        ex.bp === 'back' &&
        !explicitGroupsOf(ex) &&
        !hasExplicitMuscleMetadata(ex)
      if (!isStaleBackSnapshot) return snapshot
    }
  }
  const out = {}
  const add = (name, w) => {
    const slug = canonicalMuscle(name)
    if (slug && MUSCLES.includes(slug)) out[slug] = Math.max(out[slug] || 0, w)
  }
  const explicit = explicitGroupsOf(ex)
  if (explicit) explicit.forEach(m => add(m, 1))
  else {
    add(ex.tg, 1)
    add(ex.mg, SECONDARY)
    arrayOf(smOf(ex)).forEach(m => add(m, SECONDARY))
  }
  // Nothing recognised (custom exercises, or a target we don't draw) — use the body part.
  if (!Object.keys(out).length) Object.assign(out, BY_BODYPART[ex.bp] || {})
  return out
}

/** Snapshot display and weighted muscle metadata into a completed history entry. */
export function exerciseMuscleSnapshot(ex) {
  if (!ex || typeof ex !== 'object') return {}
  const out = {}
  if (ex.n != null) out.n = ex.n
  if (ex.bp != null) out.bp = ex.bp
  const weights = musclesOf(ex)
  if (Object.keys(weights).length) out.muscleWeights = { ...weights }
  if (hasExplicitMuscleMetadata(ex)) out.muscleGroups = [...muscleGroupsOf(ex)]
  return out
}

/**
 * Training load per muscle, in "effective sets".
 * `items` is [{ ex, sets }] — `ex` the entry or exercise whose weights are read via
 * {@link muscleWeightsOf}, `sets` a count, so a 4×8 bench press weighs four
 * times a single set. Volume in kg is deliberately not used: 100 kg of leg press
 * against 12 kg of lateral raise says nothing about which muscle worked harder.
 */
export function loadOf(items) {
  const load = {}
  items.forEach(item => {
    const { sets } = item || {}
    if (!sets) return
    const m = muscleWeightsOf(item.ex || item)
    for (const slug in m) load[slug] = (load[slug] || 0) + m[slug] * sets
  })
  return load
}

/**
 * Load for finished workouts (only sets actually ticked off count). `pick` narrows that
 * further — the map can then answer "where did the *hard* sets go", which is a different
 * question from where the sets went: a muscle can lead on volume and still never be trained
 * near failure.
 */
export const loadOfWorkouts = (workouts, pick) =>
  loadOf((workouts || []).flatMap(w =>
    (w.entries || []).map(e => ({ id: e.id, ex: e, sets: doneWorkSets(e).filter(s => !pick || pick(s)).length }))))

/** Load a routine *would* produce, from its planned set counts. */
export const loadOfRoutine = routine =>
  loadOf((routine?.ex || []).map(c => ({ id: c.id, ex: c, sets: c.sets || 1 })))

/** Load for a workout still in progress — the sets ticked so far. */
export const loadOfActive = active =>
  loadOf((active?.entries || []).map(e => ({ id: e.id, ex: e, sets: doneWorkSets(e).length })))

/**
 * Latest performed-work-set timestamp per muscle across history.
 *
 * Reads the same weights and the same performed work-set rule as the maps, so an untrained
 * muscle is simply absent and a deleted custom still counts through its snapshot.
 *
 * @param {Array<Object>} workouts - Workout history with `start`/`d` and entry set arrays.
 * @returns {Record<string, number>} Latest timestamp in milliseconds by trained muscle slug.
 */
export function lastTrainedByMuscle(workouts) {
  const latest = {}
  for (const workout of workouts || []) {
    const timestamp = workoutTimestamp(workout)
    if (!Number.isFinite(timestamp)) continue
    for (const entry of workout.entries || []) {
      if (!hasWorkSet(entry)) continue
      for (const slug of Object.keys(muscleWeightsOf(entry))) {
        if (latest[slug] == null || timestamp > latest[slug]) latest[slug] = timestamp
      }
    }
  }
  return latest
}

/**
 * Shade buckets 0–4 per muscle.
 *
 * With no `thresholds`, levels remain relative to the hardest-worked muscle in the same
 * window. This is the original balance-map behavior. When `thresholds` is supplied, levels
 * use an absolute scale instead: it is an ordered array of `{ at, level, exclusive? }` rules,
 * and the last matching rule wins. An exclusive rule matches values strictly greater than
 * `at`; otherwise the boundary is inclusive. Values below the first matching rule are l0.
 * Absolute rules let recovery views keep fixed semantic bands instead of renormalizing to the
 * strongest muscle on screen.
 */
export function levelsOf(load, thresholds) {
  if (thresholds) {
    const lv = {}
    MUSCLES.forEach(m => {
      const value = Number(load[m] || 0)
      let level = 0
      for (const rule of thresholds) {
        const matches = rule.exclusive ? value > rule.at : value >= rule.at
        if (matches) level = Math.max(0, Math.min(4, rule.level))
      }
      lv[m] = level
    })
    return lv
  }

  const max = Math.max(0, ...MUSCLES.map(m => load[m] || 0))
  const lv = {}
  MUSCLES.forEach(m => {
    const v = load[m] || 0
    lv[m] = !v ? 0 : max <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(v / max * 4)))
  })
  return lv
}

/** Muscles sorted hardest-worked first; untrained ones last, in body order. */
export function rankOf(load) {
  const worked = MUSCLES.filter(m => (load[m] || 0) > 0).sort((a, b) => load[b] - load[a])
  const missed = MUSCLES.filter(m => !(load[m] > 0))
  return { worked, missed }
}

/**
 * Quantified session muscle distribution across completed work sets.
 *
 * For each muscle trained in the workout:
 * - Direct primary work contributes 1.0 effective sets per completed work set.
 * - Compound assistance contributes 0.4 effective sets per completed work set.
 * - Custom and bodypart exercises fall back to muscleWeightsOf(entry).
 *
 * @param {Object|null|undefined} workout - Workout object with entries.
 * @returns {Array<{ slug: string, name: string, effectiveSets: number, primarySets: number, secondarySets: number, assistSets: number, compoundSets: number, exercises: string[] }>}
 * Sorted by effectiveSets descending, then primarySets descending, then alphabetical.
 */
export function sessionMuscleDistribution(workout) {
  if (!workout || !Array.isArray(workout.entries)) return []

  const map = {}
  let totalWorkSets = 0

  for (const entry of workout.entries) {
    if (!entry || typeof entry !== 'object') continue
    const workSets = doneWorkSets(entry)
    const count = workSets.length
    if (count === 0) continue
    totalWorkSets += count

    const ex = exerciseFor(entry) || entry
    const exName = ex?.n || entry?.muscleSnapshot?.n || entry?.n || (typeof entry.id === 'string' ? entry.id : '')

    const getAcc = slug => {
      if (!map[slug]) {
        map[slug] = {
          slug,
          primarySets: 0,
          secondarySets: 0,
          compoundSets: 0,
          exercises: [],
        }
      }
      return map[slug]
    }

    const addMuscleSets = (slug, count, isSecondary = false) => {
      const canonical = canonicalMuscle(slug)
      if (!canonical || canonical === 'cardio') return
      const acc = getAcc(canonical)
      if (isSecondary) {
        acc.secondarySets += count
        acc.compoundSets += count
      } else {
        acc.primarySets += count
      }
      if (exName && !acc.exercises.includes(exName)) {
        acc.exercises.push(exName)
      }
    }

    const primary = primaryMuscleOf(entry)
    const secondaries = secondaryMusclesOf(entry)

    if (primary && primary !== 'cardio') {
      addMuscleSets(primary, count)
      for (const sec of secondaries) {
        if (sec && sec !== 'cardio' && sec !== primary) {
          addMuscleSets(sec, count, true)
        }
      }
    } else {
      // Fallback: use muscleWeightsOf(entry)
      const weights = muscleWeightsOf(entry)
      const weightEntries = Object.entries(weights).filter(([slug, w]) => w > 0 && slug !== 'cardio')
      if (weightEntries.length > 0) {
        const hasPrimaryWeight = weightEntries.some(([, w]) => w >= 1)
        if (hasPrimaryWeight) {
          for (const [slug, weight] of weightEntries) {
            if (weight >= 1) {
              addMuscleSets(slug, count)
            } else {
              addMuscleSets(slug, count, true)
            }
          }
        } else {
          for (const [slug, weight] of weightEntries) {
            addMuscleSets(slug, count * weight)
          }
        }
      }
    }
  }

  if (totalWorkSets === 0) return []

  const result = []
  for (const slug of Object.keys(map)) {
    const item = map[slug]
    const primarySets = Math.round(item.primarySets * 10) / 10
    const secondarySets = item.secondarySets
    const assistSets = Math.round(secondarySets * 0.4 * 10) / 10
    const effectiveSets = Math.round((primarySets + assistSets) * 10) / 10

    if (effectiveSets <= 0 && primarySets <= 0 && secondarySets <= 0) continue

    result.push({
      slug,
      name: MUSCLE_NAME[slug] || slug,
      effectiveSets,
      primarySets,
      secondarySets,
      assistSets,
      compoundSets: item.compoundSets,
      exercises: item.exercises,
    })
  }

  result.sort((a, b) => {
    if (b.effectiveSets !== a.effectiveSets) {
      return b.effectiveSets - a.effectiveSets
    }
    if (b.primarySets !== a.primarySets) {
      return b.primarySets - a.primarySets
    }
    return String(a.name).localeCompare(String(b.name)) || String(a.slug).localeCompare(String(b.slug))
  })

  return result
}
