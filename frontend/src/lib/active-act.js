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
import { exOr, isKnownExercise } from './exercises.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Target} Target */
/** @typedef {import('./active-sets.js').HoldRef} HoldRef */
/** @typedef {{ type: string, [key: string]: unknown }} Effect */
/**
 * @typedef {{
 *   type: string,
 *   routineId?: string | null,
 *   bw?: number | null,
 *   entry?: number,
 *   set?: number,
 *   field?: 'w' | 'r' | 'sec' | 'min' | 'speed' | 'rir' | 'rpe',
 *   value?: number | null,
 *   ref?: HoldRef,
 *   elapsed?: number,
 *   exId?: string,
 *   target?: Partial<Target>,
 *   dir?: number,
 *   text?: string,
 *   first?: number,
 *   second?: number,
 * }} ActiveCommand
 */

/** @param {string} type @param {Record<string, unknown> | null} [extra] @returns {Effect} */
const effect = (type, extra) => (extra ? { type, ...extra } : { type })
/** @returns {{ ok: false, effects: Effect[] }} */
const refused = () => ({ ok: false, effects: [] })
/** @param {boolean} ok @param {Effect[]} [effects=[]] @returns {{ ok: boolean, effects: Effect[] }} */
const applied = (ok, effects = []) => (ok ? { ok: true, effects } : refused())
/** @returns {Effect[]} */
const stopTimers = () => [effect('rest:stop'), effect('hold:stop')]

/** @param {Profile} S @param {ActiveCommand} payload */
function begin(S, { routineId = null, bw = null }) {
  if (S.active && setsDone(S.active) > 0) return refused()
  S.active = createActiveSession(S, routineId, bw)
  return applied(true, stopTimers())
}

/** @param {Profile} S */
function discard(S) {
  if (!S.active) return refused()
  return applied(discardActiveSession(S), stopTimers())
}

/** @param {Profile} S */
function finish(S) {
  const result = S.active ? completeActiveSession(S) : null
  if (!result) return refused()
  return { ok: true, effects: [...stopTimers(), effect('sound:finish')], result }
}

/** @param {Profile} S @param {ActiveCommand} payload */
function toggle(S, { entry = -1, set = -1 }) {
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

/**
 * A hold's ref survives rows shifting under it, so its finish lands on the set it started from.
 * @param {Profile} S
 * @param {ActiveCommand} payload
 */
function startHold(S, { entry = -1, set = -1 }) {
  const ref = holdRef(S.active, entry, set)
  if (!ref || !S.active) return refused()
  const e = S.active.entries[entry]
  return applied(true, [effect('hold:start', { sec: e.sets[set].sec || 45, label: exOr(e.id).n, ref })])
}

/**
 * Shifting Entries cancels a running hold: its ref names a position, not an Entry.
 * @param {Profile} S
 * @param {boolean} ok
 */
function shifted(S, ok) {
  if (!ok || !S.active) return refused()
  S.active.layout = (S.active.layout || 0) + 1
  return applied(true, [effect('hold:stop')])
}

/** @param {Profile} S @param {ActiveCommand} payload */
function completeHold(S, { ref, elapsed = 0 }) {
  const at = findHoldRow(S.active, ref)
  if (!at || !S.active) return refused()
  const [entry, set] = at
  updateActiveSetField(S, entry, set, 'sec', elapsed)
  return S.active.entries[entry].sets[set].done ? applied(true) : toggle(S, { type: 'toggle', entry, set })
}

/** @param {Profile} S @param {ActiveCommand} payload */
function addExercise(S, { exId = '', target }) {
  if (!isKnownExercise(exId)) return refused()
  const entry = addActiveExercise(S, exId, target)
  return entry ? { ok: true, effects: [], result: entry } : refused()
}

/** @param {Profile} S @param {ActiveCommand} payload */
const goTo = (S, { entry = -1 }) => applied(setActiveIndex(S, entry))

/** @param {-1 | 1} dir @returns {(S: Profile) => { ok: boolean, effects: Effect[] }} */
const stepBy = dir => S => {
  if (!S.active) return refused()
  const { steps, stepIdx } = sessionView(S.active)
  const to = steps[stepIdx + dir]
  return to ? goTo(S, { type: 'goTo', entry: to.entries[0] }) : refused()
}

/** @type {Record<string, (S: Profile, command: ActiveCommand) => { ok: boolean, effects: Effect[], result?: unknown }>} */
const COMMANDS = {
  begin, discard, finish, toggle, addExercise, goTo, startHold, completeHold,
  prev: stepBy(-1),
  next: stepBy(1),
  editSet: (S, command) => applied(command.field ? updateActiveSetField(S, command.entry ?? -1, command.set ?? -1, command.field, command.value) : false),
  addSet: (S, command) => applied(addActiveSet(S, command.entry ?? -1)),
  removeSet: (S, command) => applied(removeActiveSet(S, command.entry ?? -1, command.set ?? null)),
  addWarmup: (S, command) => applied(addActiveWarmup(S, command.entry ?? -1)),
  removeExercise: (S, command) => shifted(S, removeActiveExercise(S, command.entry ?? -1)),
  replaceExercise: (S, command) => shifted(S, !!replaceActiveExercise(S, command.entry ?? -1, command.exId ?? '', command.target)),
  moveExercise: (S, command) => shifted(S, moveActiveExercise(S, command.entry ?? -1, command.dir ?? 0)),
  note: (S, command) => applied(updateActiveExerciseNote(S, command.entry ?? -1, command.text ?? '')),
  pair: (S, command) => applied(pairActiveSuperset(S, command.first ?? -1, command.second ?? -1)),
  unpair: (S, command) => applied(unpairActiveSuperset(S, command.entry ?? -1)),
}

/**
 * Execute an Active workout command against Profile `S`.
 * Never asks for confirmation: a view decides that from sessionView before sending.
 * @param {Profile} S
 * @param {ActiveCommand} command
 */
export function act(S, command) {
  const run = COMMANDS[command?.type]
  if (!run) throw new Error(`Unknown Active workout command: ${command?.type}`)
  return run(S, command)
}
