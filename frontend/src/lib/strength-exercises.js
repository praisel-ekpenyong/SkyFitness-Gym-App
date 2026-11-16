import { best1RM, latestWorkSetAt } from './training-log.js'
import { STRENGTH_FULL_MS, STRENGTH_HALF_LIFE_MS, STRENGTH_FLOOR, halfLifeDecay } from './recovery.js'
import { muscleWeightsOf } from './muscles.js'
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
      const lastAt = latestWorkSetAt(S, entry.id)
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
