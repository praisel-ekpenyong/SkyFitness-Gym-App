import { cleanupSg, pairAdjacent, unpairSuperset, supersetUnits } from './supersetFlow.js'
import { detachRoutine } from './schedule.js'
import { defaultConfig, cleanNote } from './workout-model.js'
import { uid } from './format.js'
import { DEFAULT_GLYPH } from './glyphs.js'
import { t } from './i18n.js'

const refused = () => ({ ok: false })
const applied = result => (result !== undefined ? { ok: true, result } : { ok: true })

function findRoutine(S, id) {
  if (!S || !Array.isArray(S.routines) || !id) return null
  return S.routines.find(r => r && r.id === id) ?? null
}

function create(S, command) {
  if (!S || !Array.isArray(S.routines)) return refused()
  const routine = {
    id: command.id || uid(),
    name: command.name || t('New routine'),
    emoji: command.emoji || DEFAULT_GLYPH,
    ex: [],
  }
  S.routines.push(routine)
  return applied(routine)
}

function deleteRoutine(S, command) {
  if (!S || !Array.isArray(S.routines) || !command.routineId) return refused()
  const idx = S.routines.findIndex(r => r && r.id === command.routineId)
  if (idx === -1) return refused()
  S.routines.splice(idx, 1)
  detachRoutine(S, command.routineId)
  return applied()
}

function rename(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r) return refused()
  r.name = command.name
  return applied()
}

function setGlyph(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r) return refused()
  r.emoji = command.emoji ?? command.glyph
  return applied()
}

function setProgression(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r) return refused()
  r.prog = command.prog ?? command.progression
  return applied()
}

function addExercise(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !command.exId) return refused()
  const defaults = defaultConfig(command.exId)
  const entry = { id: command.exId, ...defaults, ...(command.target || {}) }
  r.ex ??= []
  r.ex.push(entry)
  return applied(entry)
}

function removeExercise(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(r.ex)) return refused()
  const idx = command.index ?? command.entry
  if (typeof idx !== 'number' || idx < 0 || idx >= r.ex.length) return refused()
  r.ex.splice(idx, 1)
  cleanupSg(r.ex)
  return applied()
}

function moveExercise(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(r.ex)) return refused()
  const idx = command.index ?? command.entry
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

function replaceExercise(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(r.ex)) return refused()
  const idx = command.index ?? command.entry
  if (typeof idx !== 'number' || idx < 0 || idx >= r.ex.length) return refused()
  if (!command.exId) return refused()

  const oldEntry = r.ex[idx]
  const defaults = defaultConfig(command.exId)
  const target = { ...command.target }

  // ADR 0015: clear outgoing notes
  const note = cleanNote(target.notes)
  if (note) {
    target.notes = note
  } else {
    delete target.notes
  }

  const next = { id: command.exId, ...defaults, ...target }
  if (note) {
    next.notes = note
  } else {
    delete next.notes
  }

  if (oldEntry?.sg != null && target.sg === undefined) {
    next.sg = oldEntry.sg
  }

  r.ex[idx] = next
  cleanupSg(r.ex)
  return applied(next)
}

function toggleSuperset(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(r.ex)) return refused()

  let first, second
  if (command.first !== undefined && command.second !== undefined) {
    first = Math.min(command.first, command.second)
    second = Math.max(command.first, command.second)
  } else if (command.withAbove) {
    const idx = command.index ?? command.entry
    if (typeof idx !== 'number') return refused()
    first = idx - 1
    second = idx
  } else {
    const idx = command.index ?? command.entry
    if (typeof idx !== 'number') return refused()
    first = idx
    second = idx + 1
  }

  if (first < 0 || second >= r.ex.length || second - first !== 1) return refused()

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

function syncFromSession(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(command.syncedEx)) return refused()
  r.ex = command.syncedEx.map(e => ({ ...e }))
  return applied()
}

function updateExercise(S, command) {
  const r = findRoutine(S, command.routineId)
  if (!r || !Array.isArray(r.ex)) return refused()
  const idx = command.index ?? command.entry
  if (typeof idx !== 'number' || idx < 0 || idx >= r.ex.length) return refused()
  const existing = r.ex[idx]
  r.ex[idx] = { ...existing, ...command.target }
  return applied(r.ex[idx])
}

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
  updateExercise,
}

export function actRoutine(S, command) {
  const run = COMMANDS[command?.type]
  if (!run) throw new Error(`Unknown Routine command: ${command?.type}`)
  return run(S, command)
}

export function routineView(routine) {
  const ex = Array.isArray(routine?.ex) ? routine.ex : []
  const units = supersetUnits(ex)
  const unitFirst = new Set(units.filter(u => u.length > 1).map(u => u[0]))
  const inSS = new Set(units.filter(u => u.length > 1).flat())

  const steps = units.map((idxs, k) => ({
    entries: idxs,
    isSuperset: idxs.length > 1,
    isLast: k === units.length - 1,
  }))

  const entries = ex.map((e, i) => {
    const isLinkedPrev = Boolean(i > 0 && e?.sg && ex[i - 1]?.sg === e.sg)
    const isLinkedNext = Boolean(i < ex.length - 1 && e?.sg && ex[i + 1]?.sg === e.sg)
    const inSuperset = inSS.has(i)
    const isFirstInSuperset = unitFirst.has(i)
    const hasNote = Boolean(cleanNote(e?.notes))
    return {
      ...e,
      entry: e,
      index: i,
      isLinkedPrev,
      isLinkedNext,
      inSuperset,
      isFirstInSuperset,
      hasNote,
    }
  })

  return { steps, entries }
}
