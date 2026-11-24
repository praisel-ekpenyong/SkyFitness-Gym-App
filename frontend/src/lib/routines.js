import { cleanupSg, pairAdjacent, unpairSuperset, supersetUnits } from './supersetFlow.js'
import { detachRoutine } from './schedule.js'
import { defaultConfig, cleanNote } from './workout-model.js'
import { uid } from './format.js'
import { DEFAULT_GLYPH } from './glyphs.js'
import { t } from './i18n.js'
import { syncRoutineFromSession } from './routine-sync.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Routine} Routine */
/** @typedef {import('./types.js').Target} Target */
/** @typedef {import('./types.js').ProgressionPolicy} ProgressionPolicy */
/**
 * @typedef {{
 *   type: string,
 *   id?: string,
 *   routineId?: string,
 *   name?: string,
 *   emoji?: string,
 *   prog?: ProgressionPolicy,
 *   exId?: string,
 *   target?: Partial<Target>,
 *   index?: number,
 *   dir?: number,
 *   syncedEx?: Target[],
 * }} RoutineCommand
 */

/** @returns {{ ok: false }} */
const refused = () => ({ ok: false })
/** @template T @param {T} [result] @returns {{ ok: true, result?: T }} */
const applied = result => (result !== undefined ? { ok: true, result } : { ok: true })

/**
 * @param {Profile} S
 * @param {string | undefined} id
 * @returns {Routine | null}
 */
function findRoutine(S, id) {
  if (!S || !Array.isArray(S.routines) || !id) return null
  return S.routines.find(r => r && r.id === id) ?? null
}

/** @param {Profile} S @param {RoutineCommand} command */
function create(S, command) {
  if (!S || !Array.isArray(S.routines)) return refused()
  /** @type {Routine} */
  const routine = {
    id: command.id || uid(),
    name: command.name || t('New routine'),
    emoji: command.emoji || DEFAULT_GLYPH,
    ex: [],
  }
  S.routines.push(routine)
  return applied(routine)
}

/** @param {Profile} S @param {RoutineCommand} command */
function deleteRoutine(S, command) {
  if (!S || !Array.isArray(S.routines) || !command.routineId) return refused()
  const idx = S.routines.findIndex(r => r && r.id === command.routineId)
  if (idx === -1) return refused()
  S.routines.splice(idx, 1)
  detachRoutine(S, command.routineId)
  return applied()
}

/** @param {Profile} S @param {RoutineCommand} command */
function rename(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r) return refused()
  r.name = command.name ?? ''
  return applied()
}

/** @param {Profile} S @param {RoutineCommand} command */
function setGlyph(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r) return refused()
  r.emoji = command.emoji ?? ''
  return applied()
}

/** @param {Profile} S @param {RoutineCommand} command */
function setProgression(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r) return refused()
  r.prog = command.prog
  return applied()
}

/**
 * @param {Partial<Target>} [target={}]
 * @returns {{ target: Partial<Target>, note: string | undefined }}
 */
function extractTarget(target = {}) {
  const t = { ...(target || {}) }
  const note = cleanNote(t.notes)
  delete t.notes
  return { target: t, note }
}

/** @param {Profile} S @param {RoutineCommand} command */
function addExercise(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !command.exId) return refused()
  const { target, note } = extractTarget(command.target)
  const defaults = defaultConfig(command.exId, target.mode)
  /** @type {Target} */
  const entry = { id: command.exId, ...defaults, ...target, rowId: uid() }
  if (note) entry.notes = note
  r.ex ??= []
  r.ex.push(entry)
  return applied(entry)
}

/** @param {Profile} S @param {RoutineCommand} command */
function removeExercise(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(r.ex)) return refused()
  const idx = command.index
  if (typeof idx !== 'number' || idx < 0 || idx >= r.ex.length) return refused()
  r.ex.splice(idx, 1)
  cleanupSg(r.ex)
  return applied()
}

/** @param {Profile} S @param {RoutineCommand} command */
function moveExercise(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(r.ex)) return refused()
  const idx = command.index
  const dir = command.dir
  if (typeof idx !== 'number' || typeof dir !== 'number') return refused()
  const targetIdx = idx + dir
  if (idx < 0 || idx >= r.ex.length || targetIdx < 0 || targetIdx >= r.ex.length) return refused()
  const next = [...r.ex]
  ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
  cleanupSg(next)
  r.ex = next
  return applied()
}

/**
 * Replaces an exercise at the specified index or updates its configuration in-place.
 *
 * Passing the same `exId` or omitting it performs an in-place configuration update
 * (updating targets and notes over the exercise's default seed, and preserving `sg`).
 *
 * @param {Profile} S Store state.
 * @param {RoutineCommand} command Replace command payload `{ routineId, index, exId?, target? }`.
 * @returns {{ ok: boolean, result?: Target }} Result `{ ok: boolean, result?: Target }`.
 */
function replaceExercise(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(r.ex)) return refused()
  const idx = command.index
  if (typeof idx !== 'number' || idx < 0 || idx >= r.ex.length) return refused()

  const exId = command.exId || r.ex[idx]?.id
  if (!exId) return refused()

  const oldEntry = r.ex[idx]
  const { target, note } = extractTarget(command.target)
  delete target.id
  const defaults = defaultConfig(exId, target.mode)
  /** @type {Target} */
  const next = { id: exId, ...defaults, ...target }
  if (note) next.notes = note

  if (oldEntry?.sg != null && target.sg === undefined) {
    next.sg = oldEntry.sg
  }
  next.rowId = oldEntry?.rowId || uid()

  r.ex[idx] = next
  cleanupSg(r.ex)
  return applied(next)
}

/** @param {Profile} S @param {RoutineCommand} command */
function toggleSuperset(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(r.ex)) return refused()

  const first = command.index
  if (typeof first !== 'number' || first < 0 || first >= r.ex.length - 1) return refused()
  const second = first + 1

  const cur = r.ex[first]
  const next = r.ex[second]
  if (cur.sg && next.sg && cur.sg === next.sg) {
    r.ex = unpairSuperset(r.ex, second)
  } else {
    r.ex = pairAdjacent(r.ex, first, second)
  }
  cleanupSg(r.ex)
  return applied()
}

/** @param {Profile} S @param {RoutineCommand} command */
function syncFromSession(S, command) {
  return command.routineId && command.syncedEx && syncRoutineFromSession(S, command.routineId, command.syncedEx) ? applied() : refused()
}

/** @type {Record<string, (S: Profile, command: RoutineCommand) => { ok: boolean, result?: unknown }>} */
const COMMANDS = {
  create,
  delete: deleteRoutine,
  rename,
  setGlyph,
  setProgression,
  addExercise,
  removeExercise,
  moveExercise,
  replaceExercise,
  toggleSuperset,
  syncFromSession,
}

/**
 * Execute a Routine command against Profile `S`.
 * @param {Profile} S
 * @param {RoutineCommand} command
 */
export function actRoutine(S, command) {
  const run = COMMANDS[command?.type]
  if (!run) throw new Error(`Unknown Routine command: ${command?.type}`)
  return run(S, command)
}

/**
 * Read model for a Routine's exercises with superset grouping and note flags.
 * @param {Routine | null | undefined} routine
 */
export function routineView(routine) {
  const ex = Array.isArray(routine?.ex) ? routine.ex : []
  const units = supersetUnits(ex)
  const unitFirst = new Set(units.filter(u => u.length > 1).map(u => u[0]))
  const supersetIndices = new Set(units.filter(u => u.length > 1).flat())

  const entries = ex.map((e, i) => {
    const isLinkedPrev = Boolean(i > 0 && e?.sg && ex[i - 1]?.sg === e.sg)
    const inSuperset = supersetIndices.has(i)
    const isFirstInSuperset = unitFirst.has(i)
    const hasNote = Boolean(cleanNote(e?.notes))
    return {
      ...e,
      entry: e,
      isLinkedPrev,
      inSuperset,
      isFirstInSuperset,
      hasNote,
    }
  })

  return { entries }
}
