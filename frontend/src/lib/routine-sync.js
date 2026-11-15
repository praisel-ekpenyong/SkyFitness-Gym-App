
import { doneWorkSets, cleanNote } from './workout-model.js'
import { cleanupSg, supersetUnits } from './supersetFlow.js'
import { EXIDX, exOr } from './exercises.js'
import { MINUS } from './format.js'

function toTitleCase(str) {
  if (!str) return ''
  return String(str)
    .split(' ')
    .map(word => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ')
}

export function exerciseDisplayName(id, item = {}) {
  if (item?.name) return toTitleCase(item.name)
  if (item?.n) return toTitleCase(item.n)
  if (item?.target?.name) return toTitleCase(item.target.name)
  if (item?.target?.n) return toTitleCase(item.target.n)
  const ex = EXIDX[id]
  if (ex?.n) return toTitleCase(ex.n)
  if (ex?.name) return toTitleCase(ex.name)
  if (id && typeof id === 'string' && isNaN(Number(id))) {
    return toTitleCase(id)
  }
  const fallback = exOr(id)
  return fallback?.n ? toTitleCase(fallback.n) : id
}

export function detectStructuralChanges(routineExercises, sessionEntries) {
  const rIds = routineExercises.map(e => e.id)
  const sIds = sessionEntries.map(e => e.id)

  const trulyRemoved = rIds.filter(id => !sIds.includes(id))
  const trulyAdded = sIds.filter(id => !rIds.includes(id))

  const commonR = rIds.filter(id => sIds.includes(id))
  const commonS = sIds.filter(id => rIds.includes(id))
  const isReordered = commonR.some((id, idx) => id !== commonS[idx])

  const replacements = []
  const additions = []
  const removals = []

  const matchedRemoved = new Set()
  const matchedAdded = new Set()

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

  const changes = []

  for (const rep of replacements) {
    const oldName = exerciseDisplayName(rep.from, routineExercises.find(e => e.id === rep.from))
    const newName = exerciseDisplayName(rep.to, sessionEntries.find(e => e.id === rep.to))
    changes.push(`⇄ Replaced ${oldName} → ${newName}`)
  }

  for (const id of additions) {
    const name = exerciseDisplayName(id, sessionEntries.find(e => e.id === id))
    changes.push(`+ ${name}`)
  }

  for (const id of removals) {
    const name = exerciseDisplayName(id, routineExercises.find(e => e.id === id))
    changes.push(`${MINUS} ${name}`)
  }

  if (isReordered) {
    changes.push('⇅ Reordered')
  }

  return {
    replacements,
    additions,
    removals,
    isReordered,
    changes,
  }
}

export function detectSupersetChanges(
  routineExercises,
  syncedExercises,
  sessionEntries,
  replacements
) {
  const repMap = new Map(replacements.map(r => [r.from, r.to]))
  const routineUnits = supersetUnits(routineExercises).filter(u => u.length >= 2)
  const sessionUnits = supersetUnits(syncedExercises).filter(u => u.length >= 2)

  const routineSupersets = routineUnits.map(u => u.map(idx => {
    const origId = routineExercises[idx].id
    return repMap.get(origId) || origId
  }))
  const sessionSupersets = sessionUnits.map(u => u.map(idx => syncedExercises[idx].id))

  const keyOf = ids => ids.join('+')
  const routineKeys = new Set(routineSupersets.map(keyOf))
  const sessionKeys = new Set(sessionSupersets.map(keyOf))

  const changes = []

  for (let i = 0; i < sessionSupersets.length; i++) {
    const key = keyOf(sessionSupersets[i])
    if (!routineKeys.has(key)) {
      const names = sessionSupersets[i].map(id => exerciseDisplayName(id, sessionEntries.find(e => e.id === id)))
      changes.push(`Superset: ${names.join(' + ')}`)
    }
  }

  for (let i = 0; i < routineSupersets.length; i++) {
    const key = keyOf(routineSupersets[i])
    if (!sessionKeys.has(key)) {
      const names = routineUnits[i].map(idx => exerciseDisplayName(routineExercises[idx].id, routineExercises[idx]))
      changes.push(`Unlinked superset: ${names.join(' + ')}`)
    }
  }

  return changes
}

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
    sessionEntries,
    replacements
  )

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
      const name = exerciseDisplayName(entry.id, entry)
      setCountChanges.push(`${name}: ${orig.sets} → ${doneCount} sets`)
    }
  }

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
      const name = exerciseDisplayName(entry.id, entry)
      if (sessionNote) {
        noteChanges.push(`${name}: note updated`)
      } else {
        noteChanges.push(`${name}: note removed`)
      }
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

export function syncRoutineFromSession(S, routineId, syncedEx) {
  if (!S || !Array.isArray(S.routines) || !routineId || !Array.isArray(syncedEx)) {
    return false
  }
  const routine = S.routines.find(r => r.id === routineId)
  if (!routine) return false

  routine.ex = syncedEx.map(e => ({ ...e }))
  return true
}
