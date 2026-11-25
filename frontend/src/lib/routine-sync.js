
import { cleanNote } from './workout-model.js'
import { doneWorkSets } from './workout-sets.js'
import { cleanupSg, supersetUnits } from './supersetFlow.js'
import { EXIDX, exOr } from './exercises.js'
import { uid } from './format.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').Routine} Routine */
/** @typedef {import('./types.js').Target} Target */
/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').Workout} Workout */

/**
 * One difference between a Routine and the session that came from it, as data: the UI turns
 * each kind into a label. `ids` are the exercise ids involved, in display order (`replaced` is
 * old then new). `from` and `to` are the planned and performed set counts of a `sets` change.
 * @typedef {Object} SyncChange
 * @property {'replaced' | 'reordered' | 'superset' | 'unlinkedSuperset' | 'added' | 'removed' | 'sets' | 'noteUpdated' | 'noteRemoved'} kind
 * @property {string[]} ids
 * @property {number} [from]
 * @property {number} [to]
 */

/** @param {string | undefined} str @returns {string} */
function toTitleCase(str) {
  if (!str) return ''
  return String(str)
    .split(' ')
    .map(word => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ')
}

/**
 * Resolve a title-cased display name for an exercise ID or Target/Entry item.
 * @param {string} id
 * @param {Entry | Target | Partial<Entry> | Partial<Target> | null} [item={}]
 * @returns {string}
 */
export function exerciseDisplayName(id, item = {}) {
  if (item && 'name' in item && item.name) return toTitleCase(item.name)
  if (item && 'n' in item && item.n) return toTitleCase(item.n)
  if (item && 'target' in item && item.target?.name) return toTitleCase(item.target.name)
  if (item && 'target' in item && item.target?.n) return toTitleCase(item.target.n)
  const ex = EXIDX[id]
  if (ex?.n) return toTitleCase(ex.n)
  if (ex?.name) return toTitleCase(ex.name)
  if (id && typeof id === 'string' && isNaN(Number(id))) {
    return toTitleCase(id)
  }
  const fallback = exOr(id)
  return fallback?.n ? toTitleCase(fallback.n) : id
}

/**
 * Detect replacements, additions, removals, and reorderings between a Routine and an ActiveWorkout.
 * @param {Target[]} routineExercises
 * @param {Entry[]} sessionEntries
 */
export function detectStructuralChanges(routineExercises, sessionEntries) {
  const rIds = routineExercises.map(e => e.id ?? '')
  const sIds = sessionEntries.map(e => e.id)

  const trulyRemoved = rIds.filter(id => !sIds.includes(id))
  const trulyAdded = sIds.filter(id => !rIds.includes(id))

  const commonR = rIds.filter(id => sIds.includes(id))
  const commonS = sIds.filter(id => rIds.includes(id))
  const isReordered = commonR.some((id, idx) => id !== commonS[idx])

  /** @type {Array<{ from: string, to: string }>} */
  const replacements = []
  /** @type {string[]} */
  const additions = []
  /** @type {string[]} */
  const removals = []

  const matchedRemoved = new Set()
  const matchedAdded = new Set()

  /** @param {string[]} rSlice @param {string[]} sSlice */
  function pairSegments(rSlice, sSlice) {
    const rSeg = rSlice.filter(id => trulyRemoved.includes(id) && !matchedRemoved.has(id))
    const sSeg = sSlice.filter(id => trulyAdded.includes(id) && !matchedAdded.has(id))
    const pairCount = Math.min(rSeg.length, sSeg.length)
    for (let k = 0; k < pairCount; k++) {
      replacements.push({ from: rSeg[k], to: sSeg[k] })
      matchedRemoved.add(rSeg[k])
      matchedAdded.add(sSeg[k])
    }
  }

  if (rIds.length === sIds.length) {
    for (let i = 0; i < rIds.length; i++) {
      if (trulyRemoved.includes(rIds[i]) && trulyAdded.includes(sIds[i])) {
        replacements.push({ from: rIds[i], to: sIds[i] })
        matchedRemoved.add(rIds[i])
        matchedAdded.add(sIds[i])
      }
    }
  } else {
    let rIdx = 0
    let sIdx = 0
    for (const commonId of commonR) {
      const nextR = rIds.indexOf(commonId, rIdx)
      const nextS = sIds.indexOf(commonId, sIdx)
      pairSegments(rIds.slice(rIdx, nextR), sIds.slice(sIdx, nextS))
      rIdx = nextR + 1
      sIdx = nextS + 1
    }
    pairSegments(rIds.slice(rIdx), sIds.slice(sIdx))
  }

  for (const id of trulyRemoved) {
    if (!matchedRemoved.has(id)) removals.push(id)
  }
  for (const id of trulyAdded) {
    if (!matchedAdded.has(id)) additions.push(id)
  }

  /** @type {SyncChange[]} */
  const changes = [
    ...replacements.map(rep => ({ kind: /** @type {const} */ ('replaced'), ids: [rep.from, rep.to] })),
    ...additions.map(id => ({ kind: /** @type {const} */ ('added'), ids: [id] })),
    ...removals.map(id => ({ kind: /** @type {const} */ ('removed'), ids: [id] })),
  ]
  if (isReordered) changes.push({ kind: 'reordered', ids: [] })

  return {
    replacements,
    additions,
    removals,
    isReordered,
    changes,
  }
}

/**
 * Detect superset pairings added or unlinked between a Routine and an ActiveWorkout.
 * @param {Target[]} routineExercises
 * @param {Target[]} syncedExercises
 * @param {Array<{ from: string, to: string }>} replacements
 * @returns {SyncChange[]}
 */
export function detectSupersetChanges(
  routineExercises,
  syncedExercises,
  replacements
) {
  const repMap = new Map(replacements.map(r => [r.from, r.to]))
  const routineUnits = supersetUnits(routineExercises).filter(u => u.length >= 2)
  const sessionUnits = supersetUnits(syncedExercises).filter(u => u.length >= 2)

  const routineSupersets = routineUnits.map(u => u.map(idx => {
    const origId = routineExercises[idx].id ?? ''
    return repMap.get(origId) || origId
  }))
  const sessionSupersets = sessionUnits.map(u => u.map(idx => syncedExercises[idx].id ?? ''))

  /** @param {string[]} ids */
  const keyOf = ids => ids.join('+')
  const routineKeys = new Set(routineSupersets.map(keyOf))
  const sessionKeys = new Set(sessionSupersets.map(keyOf))

  /** @type {SyncChange[]} */
  const changes = []

  for (const ids of sessionSupersets) {
    if (!routineKeys.has(keyOf(ids))) changes.push({ kind: 'superset', ids })
  }

  for (let i = 0; i < routineSupersets.length; i++) {
    if (!sessionKeys.has(keyOf(routineSupersets[i]))) {
      changes.push({ kind: 'unlinkedSuperset', ids: routineUnits[i].map(idx => routineExercises[idx].id ?? '') })
    }
  }

  return changes
}

/**
 * Compute the Routine sync diff and projected `ex` list from an ActiveWorkout.
 * @param {Routine | null | undefined} routine
 * @param {ActiveWorkout | Workout | null | undefined} activeSession
 * @returns {{ hasDiff: boolean, changes: SyncChange[], syncedEx: Target[] }}
 */
export function diffRoutineWithSession(routine, activeSession) {
  if (
    !routine ||
    !Array.isArray(routine.ex) ||
    !activeSession ||
    !activeSession.routineId ||
    !Array.isArray(activeSession.entries)
  ) {
    return {
      hasDiff: false,
      changes: [],
      syncedEx: routine && Array.isArray(routine.ex) ? [...routine.ex] : [],
    }
  }

  if (routine.id && activeSession.routineId !== routine.id) {
    return {
      hasDiff: false,
      changes: [],
      syncedEx: [...routine.ex],
    }
  }

  const syncedEx = activeSession.entries.map(entry => {
    const target = entry.target || {}
    const doneCount = doneWorkSets(entry).length
    const sets = doneCount > 0 ? doneCount : (target.sets || 3)

    /** @type {Target} */
    const projected = {
      ...target,
      id: entry.id,
      sets,
    }

    if (entry.sg) {
      projected.sg = entry.sg
    } else {
      delete projected.sg
    }

    const note = cleanNote(entry.notes)
    if (note) {
      projected.notes = note
    } else {
      delete projected.notes
    }

    return projected
  })

  cleanupSg(syncedEx)

  const routineExercises = routine.ex
  const sessionEntries = activeSession.entries

  const {
    replacements,
    additions,
    changes: structuralChanges,
  } = detectStructuralChanges(routineExercises, sessionEntries)

  const supersetChanges = detectSupersetChanges(
    routineExercises,
    syncedEx,
    replacements
  )

  /** @type {SyncChange[]} */
  const setCountChanges = []
  const matchedRoutineIndicesForSets = new Set()
  for (let sIdx = 0; sIdx < sessionEntries.length; sIdx++) {
    const entry = sessionEntries[sIdx]
    if (additions.includes(entry.id)) continue
    if (replacements.some(r => r.to === entry.id)) continue

    let origIdx = -1
    if (
      routineExercises.length === sessionEntries.length &&
      routineExercises[sIdx]?.id === entry.id &&
      !matchedRoutineIndicesForSets.has(sIdx)
    ) {
      origIdx = sIdx
    } else {
      origIdx = routineExercises.findIndex(
        (e, i) => e.id === entry.id && !matchedRoutineIndicesForSets.has(i)
      )
    }
    if (origIdx === -1) continue
    matchedRoutineIndicesForSets.add(origIdx)
    const orig = routineExercises[origIdx]

    const doneCount = doneWorkSets(entry).length
    if (doneCount > 0 && doneCount !== orig.sets) {
      setCountChanges.push({ kind: 'sets', ids: [entry.id], from: orig.sets, to: doneCount })
    }
  }

  /** @type {SyncChange[]} */
  const noteChanges = []
  const matchedRoutineIndicesForNotes = new Set()
  for (let sIdx = 0; sIdx < sessionEntries.length; sIdx++) {
    const entry = sessionEntries[sIdx]
    if (additions.includes(entry.id)) continue
    if (replacements.some(r => r.to === entry.id)) continue

    let origIdx = -1
    if (
      routineExercises.length === sessionEntries.length &&
      routineExercises[sIdx]?.id === entry.id &&
      !matchedRoutineIndicesForNotes.has(sIdx)
    ) {
      origIdx = sIdx
    } else {
      origIdx = routineExercises.findIndex(
        (e, i) => e.id === entry.id && !matchedRoutineIndicesForNotes.has(i)
      )
    }
    if (origIdx === -1) continue
    matchedRoutineIndicesForNotes.add(origIdx)
    const orig = routineExercises[origIdx]

    const sessionNote = cleanNote(entry.notes)
    const origNote = cleanNote(orig.notes)

    if (sessionNote !== origNote) {
      noteChanges.push({ kind: sessionNote ? 'noteUpdated' : 'noteRemoved', ids: [entry.id] })
    }
  }

  const changes = [
    ...structuralChanges,
    ...supersetChanges,
    ...setCountChanges,
    ...noteChanges,
  ]

  const hasDiff = changes.length > 0

  return {
    hasDiff,
    changes,
    syncedEx,
  }
}

/**
 * Replace `routine.ex` with `syncedEx`.
 * @param {Profile} S
 * @param {string} routineId
 * @param {Target[]} syncedEx
 * @returns {boolean}
 */
export function syncRoutineFromSession(S, routineId, syncedEx) {
  if (!S || !Array.isArray(S.routines) || !routineId || !Array.isArray(syncedEx)) {
    return false
  }
  const routine = S.routines.find(r => r && r.id === routineId)
  if (!routine) return false

  routine.ex = syncedEx.map(e => ({ ...e, rowId: typeof e?.rowId === 'string' && e.rowId ? e.rowId : uid() }))
  return true
}
