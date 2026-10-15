// Active-workout lifecycle — facade over the carved modules.
//
// Every Profile mutation that touches the in-progress workout crosses this
// seam; UI views stay thin presentation callers. The implementation lives in:
// - active-session.js (construction, cursor, discard, add/remove Entry)
// - active-sets.js (field edits, Row add/remove, superset pairing)
// - active-toggle.js (toggle decision, next action, weight commit)
// - active-finish.js (weight cache, confirmation, PR detection, finish)
export {
  createActiveSession, setActiveIndex, discardActiveSession,
  addActiveExercise, removeActiveExercise
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
