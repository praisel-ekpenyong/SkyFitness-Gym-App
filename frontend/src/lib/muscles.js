
import { hasWorkSet } from './workout-model.js'
import { doneWorkSets } from './workout-sets.js'
import { EXIDX, smOf, mgOf, isCardio, exerciseFor } from './exercises.js'
import { workoutTimestamp } from './dates.js'
import { DELT_HEADS, isPlainShoulders, muscleKey } from './muscle-spelling.js'

export { DELT_HEADS, isPlainShoulders }

export const MUSCLES = [
  'trapezius', 'front-delts', 'side-delts', 'rear-delts', 'chest', 'upper-back', 'lats', 'serratus',
  'biceps', 'triceps', 'forearm',
  'abs', 'obliques', 'lower-back',
  'gluteal', 'quadriceps', 'hamstring', 'adductors', 'hip-flexors',
  'calves', 'tibialis',
]

/** Filter chip that matches any shoulder head. Not a muscle: nothing is credited to it. */
export const SHOULDERS = 'shoulders'

/**
 * Expands a plain Shoulders (the filter chip, or a spelling naming no head) into the three heads.
 * @param {*} value - Muscle spelling or filter.
 * @returns {string[]|null} The heads, or null when the value is not plain Shoulders.
 */
const shoulderHeadsOf = value => isPlainShoulders(value) ? DELT_HEADS : null

// A plain Shoulders on custom exercises, plan files and old custom-exercise
// snapshots is read as front 1, side 0.4, rear 0.4 when primary and front 0.4
// when secondary (ADR 0024).

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
  const name = muscleKey(value)
  if (name === 'cardio' || name === 'cardiovascular system') return 'cardio'
  if (MUSCLES.includes(name)) return name
  return ALIAS[name] || null
}

export function resolveMuscleSlug(value) {
  if (shoulderHeadsOf(value)) return SHOULDERS
  return canonicalMuscle(value) || muscleKey(value) || null
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
    shoulderHeadsOf(explicit[0])?.forEach(add)
    explicit.slice(1).forEach(add)
    return out
  }
  const rawSm = smOf(source)
  const hasSm = Array.isArray(source.sm) ? source.sm.length > 0 : source.sm != null
  const hasMg = source.mg != null
  if (source.tg || hasSm || hasMg || rawSm.length > 0) {
    shoulderHeadsOf(source.tg)?.forEach(add)
    if (mgOf(source)) add(mgOf(source))
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
  const heads = shoulderHeadsOf(filter)
  if (heads) return heads.some(head => matchesMuscleFilter(idOrEx, head))
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
  const heads = shoulderHeadsOf(filter)
  if (heads) return !heads.includes(primaryMuscleOf(idOrEx)) && heads.some(head => isSecondaryMuscleMatch(idOrEx, head))
  const target = resolveMuscleSlug(filter)
  if (!target || target === 'cardio') return false
  const primary = primaryMuscleOf(idOrEx)
  if (primary === target) return false
  return secondaryMusclesOf(idOrEx).includes(target)
}

export function muscleGroupsOf(ex) {
  const sourceEx = metadataOf(ex)
  const explicit = explicitGroupsOf(sourceEx)
  const source = explicit || [sourceEx?.tg, mgOf(sourceEx), ...arrayOf(smOf(sourceEx))]
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
    add(mgOf(ex), SECONDARY)
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
