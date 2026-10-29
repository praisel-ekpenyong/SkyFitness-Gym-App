// Active-workout lifecycle — facade over the carved modules.
//
// Every Profile mutation that touches the in-progress workout crosses this
// seam; UI views stay thin presentation callers. The implementation lives in:
// - active-session.js (construction, cursor, discard, add/remove Entry)
// - active-sets.js (field edits, Row add/remove, superset pairing)
// - active-toggle.js (toggle decision, next action, weight commit)
// - active-finish.js (weight cache, confirmation, PR detection, finish)
//
// An Active Entry (S.active.entries[i]) carries these fields, each owned by
// one slice:
// - id, target, plan, sets — construction (active-session.js). `target` is the
//   frozen Target the Entry trains against; `plan` the Prescription that made
//   the initial rows (null when the Entry has none).
// - sg — Superset group id: copied from the Routine at construction, then
//   paired/unpaired by active-sets.js; supersetFlow.js derives geometry from it.
// - asked — active-toggle.js. One-shot flag: the working-weight prompt shows at
//   most once per Entry, so an uncheck/re-check cannot reopen it.
// - hw — active-toggle.js. Per-Entry count of completed Work sets, never
//   lowered; seeded on first toggle for Entries saved before the field existed.
// - topW — active-finish.js. The confirmed working weight.
export {
  createActiveSession, setActiveIndex, discardActiveSession,
  addActiveExercise, removeActiveExercise, replaceActiveExercise,
  moveActiveExercise, buildActiveEntry, updateActiveExerciseNote
} from './active-session.js'
export {
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset
} from './active-sets.js'
export { toggleActiveSet, peekWeightCommit, commitWorkingWeight } from './active-toggle.js'
export {
  bestKnownWeight, heaviestSetWeight, heaviestForEntry, mergeExWeight,
  applyWorkingWeight, buildCompletedWorkout, completeActiveSession
} from './active-finish.js'
export { diffRoutineWithSession, syncRoutineFromSession } from './routine-sync.js'
