import {
  createActiveSession, discardActiveSession, setActiveIndex,
  addActiveExercise, removeActiveExercise, replaceActiveExercise,
  moveActiveExercise, updateActiveExerciseNote
} from './active-session.js'
import {
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset, holdRef, findHoldRow
} from './active-sets.js'
import { toggleActiveSet } from './active-toggle.js'
import { completeActiveSession } from './active-finish.js'
import { sessionView } from './session-view.js'
import { setsDone } from './workout-model.js'
import { exOr } from './exercises.js'

const effect = (type, extra) => (extra ? { type, ...extra } : { type })
const refused = () => ({ ok: false, effects: [] })
const applied = (ok, effects = []) => (ok ? { ok: true, effects } : refused())
const stopTimers = () => [effect('rest:stop'), effect('hold:stop')]

function begin(S, { routineId = null, bw = null }) {
  if (S.active && setsDone(S.active) > 0) return refused()
  S.active = createActiveSession(S, routineId, bw)
  return applied(true, stopTimers())
}

function discard(S) {
  if (!S.active) return refused()
  return applied(discardActiveSession(S), stopTimers())
}

function finish(S) {
  const result = S.active ? completeActiveSession(S) : null
  if (!result) return refused()
  return { ok: true, effects: [...stopTimers(), effect('sound:finish')], result }
}

function toggle(S, { entry, set }) {
  const res = toggleActiveSet(S, entry, set)
  if (!res) return refused()
  const effects = []
  if (res.checked) effects.push(effect('sound:set'))
  if (res.next.kind === 'open-finish') effects.push(effect('open-finish'))
  else if (res.notice) effects.push(effect('notice', { notice: res.notice }))
  if (res.rest.stop) effects.push(effect('rest:stop'))
  if (res.rest.start) effects.push(effect('rest:start', res.rest.sec ? { sec: res.rest.sec } : null))
  return applied(true, effects)
}

// A hold's ref survives rows shifting under it, so its finish lands on the set it started from.
function startHold(S, { entry, set }) {
  const ref = holdRef(S.active, entry, set)
  if (!ref) return refused()
  const e = S.active.entries[entry]
  return applied(true, [effect('hold:start', { sec: e.sets[set].sec || 45, label: exOr(e.id).n, ref })])
}

// Shifting Entries cancels a running hold: its ref names a position, not an Entry.
function shifted(S, ok) {
  if (!ok) return refused()
  S.active.layout = (S.active.layout || 0) + 1
  return applied(true, [effect('hold:stop')])
}

function completeHold(S, { ref, elapsed }) {
  const at = findHoldRow(S.active, ref)
  if (!at) return refused()
  const [entry, set] = at
  updateActiveSetField(S, entry, set, 'sec', elapsed)
  return S.active.entries[entry].sets[set].done ? applied(true) : toggle(S, { entry, set })
}

function addExercise(S, { exId, target }) {
  const entry = addActiveExercise(S, exId, target)
  return entry ? { ok: true, effects: [], result: entry } : refused()
}

const goTo = (S, { entry }) => applied(setActiveIndex(S, entry))

const stepBy = dir => S => {
  if (!S.active) return refused()
  const { steps, stepIdx } = sessionView(S.active)
  const to = steps[stepIdx + dir]
  return to ? goTo(S, { entry: to.entries[0] }) : refused()
}

const COMMANDS = {
  begin, discard, finish, toggle, addExercise, goTo, startHold, completeHold,
  prev: stepBy(-1),
  next: stepBy(1),
  editSet: (S, command) => applied(updateActiveSetField(S, command.entry, command.set, command.field, command.value)),
  addSet: (S, command) => applied(addActiveSet(S, command.entry)),
  removeSet: (S, command) => applied(removeActiveSet(S, command.entry, command.set ?? null)),
  addWarmup: (S, command) => applied(addActiveWarmup(S, command.entry)),
  removeExercise: (S, command) => shifted(S, removeActiveExercise(S, command.entry)),
  replaceExercise: (S, command) => shifted(S, !!replaceActiveExercise(S, command.entry, command.exId, command.target)),
  moveExercise: (S, command) => shifted(S, moveActiveExercise(S, command.entry, command.dir)),
  note: (S, command) => applied(updateActiveExerciseNote(S, command.entry, command.text)),
  pair: (S, command) => applied(pairActiveSuperset(S, command.first, command.second)),
  unpair: (S, command) => applied(unpairActiveSuperset(S, command.entry)),
}

// Never asks for confirmation: a view decides that from sessionView before sending.
export function act(S, command) {
  const run = COMMANDS[command?.type]
  if (!run) throw new Error(`Unknown Active workout command: ${command?.type}`)
  return run(S, command)
}
