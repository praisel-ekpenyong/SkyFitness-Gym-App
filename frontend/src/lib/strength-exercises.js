import { best1RM } from './onerm.js'
import { STRENGTH_FULL_MS, STRENGTH_HALF_LIFE_MS, STRENGTH_FLOOR, halfLifeDecay } from './recovery.js'
import { muscleWeightsOf } from './muscles.js'
import { lastWorkSetAt } from './exercise-progress.js'
import { EXIDX } from './exercises.js'

const round1 = value => Math.round(value * 10) / 10

function strengthFromAge(ageMs) {
  if (!Number.isFinite(ageMs)) return STRENGTH_FLOOR
  if (ageMs <= STRENGTH_FULL_MS) return 1
  return Math.max(STRENGTH_FLOOR, halfLifeDecay(ageMs - STRENGTH_FULL_MS, STRENGTH_HALF_LIFE_MS))
}

export function primaryMuscleOf(entry) {
  const weights = muscleWeightsOf(entry)
  let best = null
  for (const [slug, weight] of Object.entries(weights)) {
    if (!best || weight > best.weight) best = { slug, weight }
  }
  return best
}

function exerciseName(entry) {
  const ex = entry && typeof entry === 'object' ? EXIDX[entry.id] : null
  if (ex?.n) return ex.n
  if (entry?.muscleSnapshot?.n) return entry.muscleSnapshot.n
  return entry && typeof entry === 'object' && entry.n ? entry.n : null
}

function firstEntryWithId(S, id) {
  for (const workout of S?.workouts || []) {
    const entry = (workout.entries || []).find(e => e.id === id)
    if (entry) return entry
  }
  return null
}

export function strengthExerciseRows(S, now) {
  const workouts = S?.workouts || []
  const ids = [...new Set(workouts.flatMap(w => (w.entries || []).map(e => e.id)))]
  const rows = []
  for (const id of ids) {
    const best = best1RM(S, id)
    if (!best) continue
    const entry = firstEntryWithId(S, id)
    const lastAt = lastWorkSetAt(S?.workouts, id)
    const decay = lastAt == null ? STRENGTH_FLOOR : strengthFromAge(Number(now) - lastAt)
    rows.push({
      id,
      name: exerciseName(entry) || id,
      est: best.est,
      estDate: best.d,
      primary: primaryMuscleOf(entry) ? primaryMuscleOf(entry).slug : null,
      decay,
      current: round1(best.est * decay),
    })
  }
  return rows.sort((a, b) => b.current - a.current || String(a.name).localeCompare(String(b.name)))
}

export function strengthExerciseRowsForMuscle(S, now, slug) {
  const workouts = S?.workouts || []
  const seen = new Map()
  for (const workout of workouts) {
    for (const entry of workout.entries || []) {
      if (seen.has(entry.id)) continue
      const weights = muscleWeightsOf(entry)
      const weight = weights[slug]
      if (!weight) continue
      const best = best1RM(S, entry.id)
      if (!best) continue
      const lastAt = lastWorkSetAt(S?.workouts, entry.id)
      const decay = lastAt == null ? STRENGTH_FLOOR : strengthFromAge(Number(now) - lastAt)
      const primary = primaryMuscleOf(entry)
      seen.set(entry.id, {
        id: entry.id,
        name: exerciseName(entry) || entry.id,
        weight,
        primary: primary ? primary.slug : null,
        est: best.est,
        estDate: best.d,
        decay,
        current: round1(best.est * decay),
      })
    }
  }
  return [...seen.values()].sort((a, b) => b.current - a.current || String(a.name).localeCompare(String(b.name)))
}
