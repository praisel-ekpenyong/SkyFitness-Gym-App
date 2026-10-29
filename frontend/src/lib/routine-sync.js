// Pure Routine Sync domain seam: diffing and state projection.
//
// Compares an active workout session against its originating Routine template
// to evaluate differences (structural additions, removals, replacements,
// reorderings, superset modifications, and work set count adjustments),
// formats human-scannable change descriptors, and projects the updated
// exercise lineup preserving unperformed planned sets and progression weights.
//
// Governed by ADR 0014 and GLOSSARY.md (Routine sync).

import { doneWorkSets } from './workout-model.js'
import { cleanupSg, supersetUnits } from './supersetFlow.js'
import { EXIDX, exOr } from './exercises.js'

/**
 * Convert string words to Title Case.
 *
 * @param {string} str - Raw input text.
 * @returns {string} Title-cased text.
 */
function toTitleCase(str) {
  if (!str) return ''
  return String(str)
    .split(' ')
    .map(word => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ')
}

/**
 * Resolve the human-readable display name for an exercise.
 *
 * Queries embedded item names, custom exercise records in `EXIDX`, catalogue entries,
 * or catalogue fallback. Title-cases names for consistent scannability in diff tags.
 *
 * @param {string} id - Exercise identifier.
 * @param {Object} [item={}] - Optional exercise config or entry holding name hints.
 * @returns {string} Formatted exercise display name.
 */
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

/**
 * Evaluate differences between an active workout session and its originating routine,
 * and project the synchronized routine exercise lineup.
 *
 * Pure function:
 * - Detects added, removed, replaced, and reordered exercises.
 * - Detects superset groupings created, dissolved, or modified.
 * - Detects work set count adjustments (ignoring warm-up sets).
 * - Preserves original planned target set counts for skipped/unperformed exercises.
 * - Preserves exercise configurations without overwriting baseline weights with session loads.
 *
 * @param {Object|null|undefined} routine - Originating routine object ({ id, name, ex }).
 * @param {Object|null|undefined} activeSession - Active workout session object ({ routineId, entries }).
 * @returns {{ hasDiff: boolean, changes: Array<string>, syncedEx: Array<Object> }}
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

  // Session must be attached to this routine
  if (routine.id && activeSession.routineId !== routine.id) {
    return {
      hasDiff: false,
      changes: [],
      syncedEx: [...routine.ex],
    }
  }

  // 1. Project synced exercise lineup matching session entries
  const syncedEx = activeSession.entries.map(entry => {
    const target = entry.target || {}
    const doneCount = doneWorkSets(entry).length
    // If completed work sets were performed (doneCount > 0), target sets = performed count.
    // If zero work sets were performed (skipped or unticked), preserve planned target sets, never dropping or setting to 0.
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

    return projected
  })

  // Ensure contiguous superset integrity
  cleanupSg(syncedEx)

  const rList = routine.ex
  const sList = activeSession.entries

  const rIds = rList.map(e => e.id)
  const sIds = sList.map(e => e.id)

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
      const rSeg = rIds.slice(rIdx, nextR).filter(id => trulyRemoved.includes(id) && !matchedRemoved.has(id))
      const sSeg = sIds.slice(sIdx, nextS).filter(id => trulyAdded.includes(id) && !matchedAdded.has(id))
      const pairCount = Math.min(rSeg.length, sSeg.length)
      for (let k = 0; k < pairCount; k++) {
        replacements.push({ from: rSeg[k], to: sSeg[k] })
        matchedRemoved.add(rSeg[k])
        matchedAdded.add(sSeg[k])
      }
      rIdx = nextR + 1
      sIdx = nextS + 1
    }
    const rSeg = rIds.slice(rIdx).filter(id => trulyRemoved.includes(id) && !matchedRemoved.has(id))
    const sSeg = sIds.slice(sIdx).filter(id => trulyAdded.includes(id) && !matchedAdded.has(id))
    const pairCount = Math.min(rSeg.length, sSeg.length)
    for (let k = 0; k < pairCount; k++) {
      replacements.push({ from: rSeg[k], to: sSeg[k] })
      matchedRemoved.add(rSeg[k])
      matchedAdded.add(sSeg[k])
    }
  }

  for (const id of trulyRemoved) {
    if (!matchedRemoved.has(id)) removals.push(id)
  }
  for (const id of trulyAdded) {
    if (!matchedAdded.has(id)) additions.push(id)
  }

  const changes = []

  // Exercise replacements
  for (const rep of replacements) {
    const oldName = exerciseDisplayName(rep.from, rList.find(e => e.id === rep.from))
    const newName = exerciseDisplayName(rep.to, sList.find(e => e.id === rep.to))
    changes.push(`⇄ Replaced ${oldName} → ${newName}`)
  }

  // Added exercises
  for (const id of additions) {
    const name = exerciseDisplayName(id, sList.find(e => e.id === id))
    changes.push(`+ ${name}`)
  }

  // Removed exercises
  for (const id of removals) {
    const name = exerciseDisplayName(id, rList.find(e => e.id === id))
    changes.push(`- ${name}`)
  }

  // Reordered exercises
  if (isReordered) {
    changes.push('⇅ Reordered')
  }

  // Superset changes
  // Map routine superset items through replacements so an in-place replaced exercise
  // inside an intact superset doesn't trigger false unlinked/linked superset warnings.
  const repMap = new Map(replacements.map(r => [r.from, r.to]))
  const rUnits = supersetUnits(rList).filter(u => u.length >= 2)
  const sUnits = supersetUnits(syncedEx).filter(u => u.length >= 2)

  const rSs = rUnits.map(u => u.map(idx => {
    const origId = rList[idx].id
    return repMap.get(origId) || origId
  }))
  const sSs = sUnits.map(u => u.map(idx => syncedEx[idx].id))

  const keyOf = ids => ids.join('+')
  const rKeys = new Set(rSs.map(keyOf))
  const sKeys = new Set(sSs.map(keyOf))

  // Newly paired or altered supersets in session
  for (let i = 0; i < sSs.length; i++) {
    const key = keyOf(sSs[i])
    if (!rKeys.has(key)) {
      const names = sSs[i].map(id => exerciseDisplayName(id, sList.find(e => e.id === id)))
      changes.push(`Superset: ${names.join(' + ')}`)
    }
  }

  // Unpaired supersets
  for (let i = 0; i < rSs.length; i++) {
    const key = keyOf(rSs[i])
    if (!sKeys.has(key)) {
      const names = rUnits[i].map(idx => exerciseDisplayName(rList[idx].id, rList[idx]))
      changes.push(`Unlinked superset: ${names.join(' + ')}`)
    }
  }

  // Set count adjustments
  for (const entry of sList) {
    if (additions.includes(entry.id)) continue
    if (replacements.some(r => r.to === entry.id)) continue

    const orig = rList.find(e => e.id === entry.id)
    if (!orig) continue

    const doneCount = doneWorkSets(entry).length
    if (doneCount > 0 && doneCount !== orig.sets) {
      const name = exerciseDisplayName(entry.id, entry)
      changes.push(`${name}: ${orig.sets} → ${doneCount} sets`)
    }
  }

  const hasDiff = changes.length > 0

  return {
    hasDiff,
    changes,
    syncedEx,
  }
}

/**
 * Mutate application state atom S to synchronize a routine's exercise lineup.
 *
 * Finds routine in `S.routines` by `routineId` and updates its `ex` array to `syncedEx`.
 * Safely returns false and no-ops if routine is not found or `S.routines` is missing.
 *
 * @param {Object} S - Application state atom containing `routines`.
 * @param {string} routineId - Target routine identifier.
 * @param {Array<Object>} syncedEx - New exercise lineup array.
 * @returns {boolean} True if routine was found and updated; false otherwise.
 */
export function syncRoutineFromSession(S, routineId, syncedEx) {
  if (!S || !Array.isArray(S.routines) || !routineId || !Array.isArray(syncedEx)) {
    return false
  }
  const routine = S.routines.find(r => r.id === routineId)
  if (!routine) return false

  routine.ex = syncedEx.map(e => ({ ...e }))
  return true
}
