import { EFFORT } from '../effort.js'

function profile(raw) {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw)
}

function sealEffort(raw) {
  const e = raw.effort
  if (e === 'none' || EFFORT[e]) return e
  return raw.showRir ? 'rir' : 'none'
}

export function admit(raw) {
  if (!profile(raw)) return raw
  const rest = { ...raw, effort: sealEffort(raw) }
  delete rest.showRir
  return rest
}

export function toDisk(profileState) {
  if (!profile(profileState)) return profileState
  const rest = { ...profileState }
  delete rest.showRir
  return rest
}
