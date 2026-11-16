import {
  createActiveSession, discardActiveSession, setActiveIndex,
  addActiveExercise, removeActiveExercise, replaceActiveExercise,
  moveActiveExercise, updateActiveExerciseNote
} from './active-session.js'
import {
  updateActiveSetField, addActiveSet, removeActiveSet, addActiveWarmup,
  pairActiveSuperset, unpairActiveSuperset
} from './active-sets.js'
import { toggleActiveSet } from './active-toggle.js'
import { completeActiveSession } from './active-finish.js'
import { sessionView } from './session-view.js'
import { setsDone } from './workout-model.js'

const fx = (type, extra) => (extra ? { type, ...extra } : { type })
const no = () => ({ ok: false, effects: [] })
const done = (ok, effects = []) => (ok ? { ok: true, effects } : no())
const stopTimers = () => [fx('rest:stop'), fx('hold:stop')]

function begin(S, { routineId = null, bw = null }) {
  if (S.active && setsDone(S.active) > 0) return no()
  S.active = createActiveSession(S, routineId, bw)
  return done(true, stopTimers())
}

function discard(S) {
  if (!S.active) return no()
  return done(discardActiveSession(S), stopTimers())
}

function finish(S) {
  const result = S.active ? completeActiveSession(S) : null
  if (!result) return no()
  return { ok: true, effects: [...stopTimers(), fx('sound:finish')], result }
}

function toggle(S, { entry, set }) {
  const res = toggleActiveSet(S, entry, set)
  if (!res) return no()
  const effects = []
  if (res.checked) effects.push(fx('sound:set'))
  if (res.next.kind === 'open-finish') effects.push(fx('open-finish'))
  else if (res.notice) effects.push(fx('notice', { notice: res.notice }))
  if (res.rest.stop) effects.push(fx('rest:stop'))
  if (res.rest.start) effects.push(fx('rest:start'))
  return done(true, effects)
}

function addExercise(S, { exId, target }) {
  const entry = addActiveExercise(S, exId, target)
  return entry ? { ok: true, effects: [], result: entry } : no()
}

const goTo = (S, { entry }) => done(setActiveIndex(S, entry))

const stepBy = dir => S => {
  if (!S.active) return no()
  const { steps, stepIdx } = sessionView(S.active)
  const to = steps[stepIdx + dir]
  return to ? goTo(S, { entry: to.entries[0] }) : no()
}

const COMMANDS = {
  begin, discard, finish, toggle, addExercise, goTo,
  prev: stepBy(-1),
  next: stepBy(1),
  editSet: (S, c) => done(updateActiveSetField(S, c.entry, c.set, c.field, c.value)),
  addSet: (S, c) => done(addActiveSet(S, c.entry)),
  removeSet: (S, c) => done(removeActiveSet(S, c.entry, c.set ?? null)),
  addWarmup: (S, c) => done(addActiveWarmup(S, c.entry)),
  removeExercise: (S, c) => done(removeActiveExercise(S, c.entry), [fx('hold:stop')]),
  replaceExercise: (S, c) => done(!!replaceActiveExercise(S, c.entry, c.exId, c.target)),
  moveExercise: (S, c) => done(moveActiveExercise(S, c.entry, c.dir)),
  note: (S, c) => done(updateActiveExerciseNote(S, c.entry, c.text)),
  pair: (S, c) => done(pairActiveSuperset(S, c.first, c.second)),
  unpair: (S, c) => done(unpairActiveSuperset(S, c.entry)),
}

/**
 * The one way to change the Active workout. Mutates the Profile draft `S` and
 * never asks for confirmation: a view decides that from sessionView first.
 * Timers, sound, notices and the finish sheet come back as effects.
 * @param {Object} S - Profile draft.
 * @param {{type: string}} command
 * @returns {{ok: boolean, effects: Array<{type: string}>, result?: *}}
 */
export function act(S, command) {
  const run = COMMANDS[command?.type]
  if (!run) throw new Error(`Unknown Active workout command: ${command?.type}`)
  return run(S, command)
}
