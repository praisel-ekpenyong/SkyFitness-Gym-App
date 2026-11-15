// Active-workout lifecycle — facade over the carved modules.
//
// Every Profile mutation that touches the in-progress workout crosses this
// seam; UI views stay thin presentation callers. The implementation lives in:
// - active-session.js (construction, cursor, discard, add/remove Entry)
// - active-sets.js (field edits, Row add/remove, superset pairing)
// - active-toggle.js (toggle decision, next action, Next key target)
// - active-finish.js (weight cache, Record detection, finish)
//
// An Active Entry (S.active.entries[i]) carries these fields, each owned by
// one slice:
// - id, target, plan, sets — construction (active-session.js). `target` is the
//   frozen Target the Entry trains against; `plan` the Prescription that made
//   the initial rows (null when the Entry has none).
// - sg — Superset group id: copied from the Routine at construction, then
//   paired/unpaired by active-sets.js; supersetFlow.js derives geometry from it.
// - asked — legacy. Sessions saved before ADR 0020 may carry it; nothing reads
//   it, and replacing an Entry clears it.
// - hw — active-toggle.js. Per-Entry count of completed Work sets, never
//   lowered; seeded on first toggle for Entries saved before the field existed.
// - topW — legacy, read-only (ADR 0020). Entries saved before ADR 0020 may
//   carry a confirmed working weight; heaviestForEntry still reads it.
export {
  createActiveSession, setActiveIndex, discardActiveSession,
  addActiveExercise, removeActiveExercise, replaceActiveExercise,
  moveActiveExercise, buildActiveEntry, updateActiveExerciseNote
} from './active-session.js'
export {
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset
} from './active-sets.js'
export { toggleActiveSet, nextUnitTarget } from './active-toggle.js'
export {
  bestKnownWeight, heaviestSetWeight, heaviestForEntry, mergeExWeight,
  buildCompletedWorkout, completeActiveSession
} from './active-finish.js'
export { diffRoutineWithSession, syncRoutineFromSession } from './routine-sync.js'
