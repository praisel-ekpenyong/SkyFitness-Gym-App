/** @typedef {{ sheetId: string, openedHref: string, backEligible: boolean }} SheetHistoryEntry */
/** @typedef {{ id: string, locked?: boolean }} SheetDescriptor */
/** @typedef {{ sheetIds: string[], entries: SheetHistoryEntry[], pendingProgrammaticPops: number }} SheetHistoryState */
/** @typedef {{ type: 'sheets-changed', sheets: SheetDescriptor[], href: string } | { type: 'pop', sheets: SheetDescriptor[], href: string }} SheetHistoryAction */
/** @typedef {{ type: 'push' } | { type: 'rewind', count: number } | { type: 'close', id: string }} SheetHistoryEffect */

/** @returns {SheetHistoryState} */
export function createSheetHistoryState() {
  return {
    sheetIds: [],
    entries: [],
    pendingProgrammaticPops: 0,
  }
}

/**
 * @param {SheetHistoryEntry[]} entries
 * @param {string} href
 * @returns {number}
 */
function drainTombstones(entries, href) {
  let count = 0
  while (entries.length > 0) {
    const top = entries[entries.length - 1]
    if (top.backEligible || top.openedHref !== href) break
    entries.pop()
    count++
  }
  return count
}

/**
 * @param {SheetHistoryState} state
 * @param {SheetHistoryAction} action
 * @returns {{ state: SheetHistoryState, effects: SheetHistoryEffect[] }}
 */
export function transitionSheetHistory(state, action) {
  if (action.type === 'sheets-changed') {
    const sheetIds = action.sheets.map(sheet => sheet.id)
    const nextIds = new Set(sheetIds)
    const previousIds = new Set(state.sheetIds)
    const closedIds = state.sheetIds.filter(id => !nextIds.has(id))
    const openedSheets = action.sheets.filter(sheet => !previousIds.has(sheet.id))
    const entries = state.entries.map(entry =>
      closedIds.includes(entry.sheetId) ? { ...entry, backEligible: false } : entry
    )
    for (const sheet of openedSheets) {
      entries.push({ sheetId: sheet.id, openedHref: action.href, backEligible: true })
    }

    const rewind = closedIds.length ? drainTombstones(entries, action.href) : 0
    /** @type {SheetHistoryEffect[]} */
    const effects = openedSheets.map(() => ({ type: 'push' }))
    if (rewind > 0) effects.push({ type: 'rewind', count: rewind })
    return {
      state: {
        sheetIds,
        entries,
        pendingProgrammaticPops: state.pendingProgrammaticPops + (rewind > 0 ? 1 : 0),
      },
      effects,
    }
  }

  if (action.type === 'pop') {
    if (state.pendingProgrammaticPops > 0) {
      return {
        state: { ...state, pendingProgrammaticPops: state.pendingProgrammaticPops - 1 },
        effects: [],
      }
    }
    if (state.entries.length === 0) return { state, effects: [] }

    const popped = state.entries[state.entries.length - 1]
    const entries = state.entries.slice(0, -1)
    const top = action.sheets[action.sheets.length - 1]
    const rewind = drainTombstones(entries, action.href)
    /** @type {SheetHistoryEffect[]} */
    const effects = []
    if (popped.backEligible && top?.id === popped.sheetId && !top.locked) {
      effects.push({ type: 'close', id: top.id })
    }
    if (rewind > 0) effects.push({ type: 'rewind', count: rewind })
    return {
      state: {
        ...state,
        entries,
        pendingProgrammaticPops: state.pendingProgrammaticPops + (rewind > 0 ? 1 : 0),
      },
      effects,
    }
  }

  throw new TypeError('Unknown sheet history action')
}
