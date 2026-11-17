
import { doneWorkSets, hasWorkSet } from './workout-model.js'
import { EXIDX, smOf, isCardio, exerciseFor } from './exercises.js'
import { workoutTimestamp } from './format.js'

export const MUSCLES = [
  'trapezius', 'front-delts', 'side-delts', 'rear-delts', 'chest', 'upper-back', 'lats', 'serratus',
  'biceps', 'triceps', 'forearm',
  'abs', 'obliques', 'lower-back',
  'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors',
  'calves', 'tibialis',
]

/** The three deltoid heads, front to back. */
export const DELT_HEADS = ['front-delts', 'side-delts', 'rear-delts']

/** Filter chip that matches any shoulder head. Not a muscle: nothing is credited to it. */
export const SHOULDERS = 'shoulders'

const PLAIN_SHOULDERS = new Set(['shoulders', 'deltoids', 'delts'])
/**
 * Tells whether a muscle spelling is a plain Shoulders that names no head.
 * Found on custom exercises, plan files and old custom-exercise snapshots; read
 * as front 1, side 0.4, rear 0.4 when primary and front 0.4 when secondary.
 */
export const isPlainShoulders = value => PLAIN_SHOULDERS.has(String(value || '').toLowerCase().trim())

const plainShouldersWeights = asPrimary => asPrimary
  ? [['front-delts', 1], ['side-delts', 0.4], ['rear-delts', 0.4]]
  : [['front-delts', 0.4]]

export const INERT = ['head', 'hair', 'neck', 'hands', 'feet', 'knees', 'ankles']

export const MUSCLE_NAME = {
  trapezius: 'Traps', shoulders: 'Shoulders',
  'front-delts': 'Front delts', 'side-delts': 'Side delts', 'rear-delts': 'Rear delts', chest: 'Chest', 'upper-back': 'Upper back',
  lats: 'Lats', serratus: 'Serratus', biceps: 'Biceps', triceps: 'Triceps', forearm: 'Forearms',
  abs: 'Abs', obliques: 'Obliques', 'lower-back': 'Lower back', gluteal: 'Glutes',
  quadriceps: 'Quads', hamstring: 'Hamstrings', adductors: 'Adductors',
  'hip-flexors': 'Hip flexors', calves: 'Calves', tibialis: 'Shins',
  cardio: 'Cardio',
}

/** Muscles a lifter can pick for a custom exercise: the 21 plus cardio. */
export const PICKABLE_MUSCLES = [...MUSCLES, 'cardio']

/** Library and picker filter chips: the 21 plus cardio, with a Shoulders chip before the heads. */
export const FILTER_MUSCLES = [...MUSCLES.slice(0, 1), SHOULDERS, ...MUSCLES.slice(1), 'cardio']

const MUSCLE_TO_BODYPART = {
  trapezius: 'neck',
  'front-delts': 'shoulders',
  'side-delts': 'shoulders',
  'rear-delts': 'shoulders',
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

const ALIAS = {
  abs: 'abs', pectorals: 'chest', biceps: 'biceps', glutes: 'gluteal', delts: 'front-delts',
  triceps: 'triceps', 'upper back': 'upper-back', lats: 'lats', calves: 'calves',
  quads: 'quadriceps', forearms: 'forearm', hamstrings: 'hamstring', spine: 'lower-back',
  traps: 'trapezius', adductors: 'adductors', 'serratus anterior': 'serratus',
  abductors: 'gluteal', 'levator scapulae': 'trapezius', 'cardiovascular system': null,
  shoulders: 'front-delts', deltoids: 'front-delts', 'rear deltoids': 'rear-delts',
  'front delts': 'front-delts', 'side delts': 'side-delts', 'rear delts': 'rear-delts',
  'front deltoids': 'front-delts', 'side deltoids': 'side-delts', 'lateral deltoids': 'side-delts',
  'rotator cuff': 'rear-delts', quadriceps: 'quadriceps', core: 'abs', abdominals: 'abs',
  'lower abs': 'abs', chest: 'chest', 'upper chest': 'chest', 'hip flexors': 'hip-flexors',
  obliques: 'obliques', 'lower back': 'lower-back', rhomboids: 'upper-back',
  trapezius: 'trapezius', back: 'upper-back', 'latissimus dorsi': 'lats', latissimus: 'lats',
  brachialis: 'biceps', soleus: 'calves', shins: 'tibialis', wrists: 'forearm',
  'wrist flexors': 'forearm', 'wrist extensors': 'forearm', 'grip muscles': 'forearm',
  groin: 'adductors', 'inner thighs': 'adductors',
  ankles: null, feet: null, hands: null, 'ankle stabilizers': null,
  sternocleidomastoid: null,
}
const BY_BODYPART = {
  chest: { chest: 1 },
  back: { lats: 0.50, 'upper-back': 0.35, 'lower-back': 0.15 },
  shoulders: { 'front-delts': 1, 'side-delts': 0.4, 'rear-delts': 0.4 },
  'upper arms': { biceps: 0.5, triceps: 0.5 },
  'lower arms': { forearm: 1 },
  waist: { abs: 0.7, obliques: 0.3 },
  'upper legs': { quadriceps: 0.4, hamstring: 0.35, gluteal: 0.25 },
  'lower legs': { calves: 0.8, tibialis: 0.2 },
  neck: { trapezius: 1 },
  cardio: {},
}
const SECONDARY = 0.4

const arrayOf = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value]

const hasDirectMuscleMeta = ex => !!ex && typeof ex === 'object' && (
  ['muscleGroups', 'muscles', 'targetMuscles'].some(key => Object.prototype.hasOwnProperty.call(ex, key))
  || [ex.tg, ex.mg, ...arrayOf(ex.sm)].some(value => value != null && value !== '')
)

function metadataOf(ex) {
  if (!ex || typeof ex !== 'object') return ex
  return !hasDirectMuscleMeta(ex) && ex.muscleSnapshot && typeof ex.muscleSnapshot === 'object' && !Array.isArray(ex.muscleSnapshot)
    ? ex.muscleSnapshot
    : ex
}

const hasOwnMuscleMeta = ex =>
  hasDirectMuscleMeta(ex) || (!!ex && typeof ex === 'object' && ex.muscleWeights
    && typeof ex.muscleWeights === 'object' && !Array.isArray(ex.muscleWeights)
    && Object.keys(ex.muscleWeights).length > 0)

export function muscleWeightsOf(entry) {
  const source = entry && typeof entry === 'object' ? entry : null
  if (!source) return {}
  return hasOwnMuscleMeta(source) ? musclesOf(source) : musclesOf(exerciseFor(source))
}

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

export function resolveMuscleSlug(value) {
  if (String(value || '').toLowerCase().trim() === SHOULDERS) return SHOULDERS
  const slug = canonicalMuscle(value)
  if (slug) return slug
  return String(value || '').toLowerCase().trim() || null
}

export function bodypartForMuscle(muscle) {
  const slug = resolveMuscleSlug(muscle)
  return MUSCLE_TO_BODYPART[slug] || (BY_BODYPART[slug] ? slug : 'chest')
}

const asExercise = exercise => typeof exercise === 'string' ? EXIDX[exercise] : exercise

export function primaryMuscleOf(exercise) {
  const raw = asExercise(exercise)
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

export function primaryMuscleName(exercise) {
  const primary = primaryMuscleOf(exercise)
  if (primary && MUSCLE_NAME[primary]) return MUSCLE_NAME[primary]
  const ex = asExercise(exercise)
  return (ex && (ex.tg || ex.bp)) || ''
}

export function secondaryMusclesOf(exercise) {
  const raw = asExercise(exercise)
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
    if (isPlainShoulders(explicit[0])) DELT_HEADS.forEach(add)
    explicit.slice(1).forEach(add)
    return out
  }
  const rawSm = smOf(source)
  const hasSm = Array.isArray(source.sm) ? source.sm.length > 0 : source.sm != null
  const hasMg = source.mg != null
  if (source.tg || hasSm || hasMg || rawSm.length > 0) {
    if (isPlainShoulders(source.tg)) DELT_HEADS.forEach(add)
    if (source.mg) add(source.mg)
    rawSm.forEach(add)
    return out
  }
  if (!source.tg && source.bp && BY_BODYPART[source.bp]) {
    Object.keys(BY_BODYPART[source.bp]).forEach(add)
  }
  return out
}

export function matchesMuscleFilter(idOrEx, filter) {
  if (!filter) return true
  if (filter === SHOULDERS) return DELT_HEADS.some(head => matchesMuscleFilter(idOrEx, head))
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

export function isSecondaryMuscleMatch(idOrEx, filter) {
  if (!filter || filter === 'cardio' || filter === 'favorites') return false
  if (filter === SHOULDERS) {
    return !DELT_HEADS.includes(primaryMuscleOf(idOrEx)) && DELT_HEADS.some(head => isSecondaryMuscleMatch(idOrEx, head))
  }
  const target = resolveMuscleSlug(filter)
  if (!target || target === 'cardio') return false
  const primary = primaryMuscleOf(idOrEx)
  if (primary === target) return false
  return secondaryMusclesOf(idOrEx).includes(target)
}

export const SEARCH_STOP_WORDS = new Set(['with', 'on', 'in', 'for', 'the', 'to', 'at', 'and', 'or', 'a', 'an'])

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

export function stringIncludesToken(str, token) {
  if (!str || !token) return false
  const s = String(str).toLowerCase()
  const t = String(token).toLowerCase()
  if (/^\d+$/.test(t)) {
    return new RegExp(`(?<!\\d)${t}(?!\\d)`).test(s)
  }
  return s.includes(t)
}



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

export function matchesExerciseSearch(idOrEx, query) {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return true
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return false
  const ctx = exerciseContext(ex)
  return tokens.some(token => tokenMatchesExercise(token, ex, ctx))
}


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

export function matchesMuscleGroups(ex, requested) {
  const wanted = arrayOf(requested).map(canonicalMuscle).filter(Boolean)
  if (!wanted.length) return true
  const groups = new Set(muscleGroupsOf(ex))
  return wanted.some(group => groups.has(group))
}

export function musclesOf(idOrEx) {
  const ex = typeof idOrEx === 'string' ? EXIDX[idOrEx] : idOrEx
  if (!ex) return {}
  const sourceEx = hasOwnMuscleMeta(ex) ? ex : metadataOf(ex)
  if (sourceEx !== ex) return musclesOf(sourceEx)
  if (ex.muscleWeights && typeof ex.muscleWeights === 'object' && !Array.isArray(ex.muscleWeights)) {
    const snapshot = {}
    const credit = (slug, weight) => { snapshot[slug] = Math.max(snapshot[slug] || 0, weight) }
    Object.entries(ex.muscleWeights).forEach(([key, value]) => {
      const weight = Number(value)
      if (!Number.isFinite(weight) || weight <= 0) return
      if (isPlainShoulders(key)) plainShouldersWeights(weight >= 1).forEach(([slug, w]) => credit(slug, w))
      else if (MUSCLES.includes(key)) credit(key, weight)
    })
    if (Object.keys(snapshot).length) {
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
  const addPrimary = name => isPlainShoulders(name)
    ? plainShouldersWeights(true).forEach(([slug, w]) => add(slug, w))
    : add(name, 1)
  const explicit = explicitGroupsOf(ex)
  if (explicit) explicit.forEach((m, i) => i === 0 ? addPrimary(m) : add(m, 1))
  else {
    addPrimary(ex.tg)
    add(ex.mg, SECONDARY)
    arrayOf(smOf(ex)).forEach(m => add(m, SECONDARY))
  }
  if (!Object.keys(out).length) Object.assign(out, BY_BODYPART[ex.bp] || {})
  return out
}

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

export const loadOfWorkouts = (workouts, pick) =>
  loadOf((workouts || []).flatMap(w =>
    (w.entries || []).map(e => ({ id: e.id, ex: e, sets: doneWorkSets(e).filter(s => !pick || pick(s)).length }))))

export const loadOfRoutine = routine =>
  loadOf((routine?.ex || []).map(c => ({ id: c.id, ex: c, sets: c.sets || 1 })))

export const loadOfActive = active =>
  loadOf((active?.entries || []).map(e => ({ id: e.id, ex: e, sets: doneWorkSets(e).length })))

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

export function rankOf(load) {
  const worked = MUSCLES.filter(m => (load[m] || 0) > 0).sort((a, b) => load[b] - load[a])
  const missed = MUSCLES.filter(m => !(load[m] > 0))
  return { worked, missed }
}

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
