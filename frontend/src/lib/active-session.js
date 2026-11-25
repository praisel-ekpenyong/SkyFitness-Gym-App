import { buildSets, defaultConfig, cleanNote, isEntryIndex } from './workout-model.js'
import { nextPrescription, applyPrescription } from './progression.js'
import { withSetId } from './active-sets.js'
import { uid } from './format.js'
import { todayISO } from './dates.js'
import { t } from './i18n.js'
import { cleanupSg } from './supersetFlow.js'

/** @typedef {import('./types.js').Profile} Profile */
/** @typedef {import('./types.js').ActiveWorkout} ActiveWorkout */
/** @typedef {import('./types.js').Entry} Entry */
/** @typedef {import('./types.js').Target} Target */
/** @typedef {import('./types.js').SetRow} SetRow */
/** @typedef {import('./types.js').Prescription} Prescription */

/**
 * @param {Profile} S
 * @param {Target} cfg
 * @param {string | null | undefined} routineId
 * @param {Prescription} plan
 * @returns {SetRow[]}
 */
function seedSets(S, cfg, routineId, plan) {
  return buildSets(S, cfg, {
    routineId,
    seedWeightOnly: plan.kind === 'first',
  })
}

/**
 * Create a new ActiveWorkout from a Routine (or Freestyle when `routineId` is null).
 * @param {Profile} S
 * @param {string | null | undefined} routineId
 * @param {number | null | undefined} bw
 * @returns {ActiveWorkout}
 */
export function createActiveSession(S, routineId, bw) {
  const routine = routineId ? (S.routines || []).find(r => r.id === routineId) : null
  const entries = (routine ? routine.ex : []).map(cfg => {
    const plan = nextPrescription(S, cfg, routine)
    const sets = applyPrescription(seedSets(S, cfg, routine?.id, plan), plan).map(withSetId)
    /** @type {Target} */
    const target = { ...cfg }
    /** @type {Entry} */
    const entry = { id: cfg.id ?? '', sg: cfg.sg, target, plan, sets }
    const note = cleanNote(cfg.notes)
    if (note) {
      entry.notes = note
      target.notes = note
    } else {
      delete entry.notes
      delete target.notes
    }
    return entry
  })
  return {
    id: uid(),
    d: todayISO(),
    start: Date.now(),
    routineId: routine ? routine.id : null,
    name: routine ? routine.name : t('Freestyle'),
    bw: bw || null,
    unit: S?.unit || 'kg',
    cur: 0,
    entries,
  }
}

/**
 * @param {Profile} S
 * @param {number} idx
 * @returns {boolean}
 */
export function setActiveIndex(S, idx) {
  if (!S?.active || !isEntryIndex(S.active.entries, idx)) return false
  S.active.cur = idx
  return true
}

/**
 * @param {Profile} S
 * @returns {boolean}
 */
export function discardActiveSession(S) {
  if (!S) return false
  S.active = null
  return true
}

/**
 * Build a fresh ActiveWorkout Entry for `exId`.
 * @param {Profile} S
 * @param {string} exId
 * @param {Partial<Target>} [targetCfg={}]
 * @returns {Entry}
 */
export function buildActiveEntry(S, exId, targetCfg = {}) {
  const routine = S?.active?.routineId ? (S.routines || []).find(r => r.id === S.active?.routineId) : null
  const freestyle = !S?.active?.routineId
  const full = { ...defaultConfig(exId), ...targetCfg, id: exId }
  const plan = freestyle ? null : nextPrescription(S, full, routine)
  const baseSets = freestyle
    ? buildSets(S, full, { preferLast: true })
    : (plan ? seedSets(S, full, S?.active?.routineId, plan) : buildSets(S, full))
  const sets = (freestyle ? baseSets : applyPrescription(baseSets, plan)).map(withSetId)
  /** @type {Partial<Target>} */
  const target = { ...targetCfg }
  /** @type {Entry} */
  const entry = { id: exId, target, plan, sets }
  const note = cleanNote(targetCfg.notes)
  if (note) {
    entry.notes = note
    target.notes = note
  } else {
    delete entry.notes
    delete target.notes
  }
  return entry
}

/**
 * @param {Profile} S
 * @param {string} exId
 * @param {Partial<Target>} [targetCfg={}]
 * @returns {Entry | null}
 */
export function addActiveExercise(S, exId, targetCfg = {}) {
  if (!S?.active) return null
  const cleanTarget = { ...targetCfg }
  delete cleanTarget.notes
  const entry = buildActiveEntry(S, exId, cleanTarget)
  delete entry.notes
  if (entry.target) delete entry.target.notes
  if (!Array.isArray(S.active.entries)) S.active.entries = []
  S.active.entries.push(entry)
  S.active.cur = S.active.entries.length - 1
  return entry
}

/**
 * @param {Profile} S
 * @param {number} idx
 * @returns {boolean}
 */
export function removeActiveExercise(S, idx) {
  if (!S?.active || !Array.isArray(S.active.entries)) return false
  if (idx < 0 || idx >= S.active.entries.length) return false
  S.active.entries.splice(idx, 1)
  cleanupSg(S.active.entries)
  if (idx < S.active.cur) S.active.cur--
  if (S.active.cur >= S.active.entries.length) {
    S.active.cur = Math.max(0, S.active.entries.length - 1)
  }
  return true
}

/**
 * @param {Profile} S
 * @param {number} idx
 * @param {string} newExId
 * @param {Partial<Target>} [targetCfg={}]
 * @returns {Entry | null}
 */
export function replaceActiveExercise(S, idx, newExId, targetCfg = {}) {
  if (!S?.active || !Array.isArray(S.active.entries)) return null
  if (idx < 0 || idx >= S.active.entries.length) return null
  if (!newExId) return null

  const oldEntry = S.active.entries[idx]
  const note = cleanNote(targetCfg.notes)
  const cleanTarget = { ...targetCfg }
  if (note) {
    cleanTarget.notes = note
  } else {
    delete cleanTarget.notes
  }
  const entry = buildActiveEntry(S, newExId, cleanTarget)
  if (note) {
    entry.notes = note
    if (entry.target) entry.target.notes = note
  } else {
    delete entry.notes
    if (entry.target) delete entry.target.notes
  }
  if (oldEntry && oldEntry.sg != null) {
    entry.sg = oldEntry.sg
  }

  S.active.entries[idx] = entry
  S.active.cur = Math.max(0, Math.min(idx, S.active.entries.length - 1))
  return entry
}

/**
 * @param {Profile} S
 * @param {number} entryIdx
 * @param {string} noteText
 * @returns {boolean}
 */
export function updateActiveExerciseNote(S, entryIdx, noteText) {
  if (!S?.active?.entries?.[entryIdx]) return false
  const entry = S.active.entries[entryIdx]
  const clean = cleanNote(noteText)
  if (clean) {
    entry.notes = clean
  } else {
    delete entry.notes
  }
  return true
}

/**
 * @param {Profile} S
 * @param {number} idx
 * @param {number} dir
 * @returns {boolean}
 */
export function moveActiveExercise(S, idx, dir) {
  if (!S?.active || !Array.isArray(S.active.entries)) return false
  if (!Number.isInteger(idx) || !Number.isInteger(dir)) return false
  if (dir !== -1 && dir !== 1) return false
  const targetIdx = idx + dir
  if (idx < 0 || idx >= S.active.entries.length) return false
  if (targetIdx < 0 || targetIdx >= S.active.entries.length) return false

  const entries = S.active.entries
  const temp = entries[idx]
  entries[idx] = entries[targetIdx]
  entries[targetIdx] = temp

  cleanupSg(entries)

  S.active.cur = targetIdx

  return true
}

