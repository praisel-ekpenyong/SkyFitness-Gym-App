/** @typedef {{ sheetId: string, openedHref: string, backEligible: boolean, locked: boolean }} SheetHistoryEntry */
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
 * Whether the Module still owns a browser entry a Back press should consume.
 * A locked sheet consumes its press too: only its closing is suppressed.
 * @param {SheetHistoryState} state
 * @returns {boolean}
 */
export function consumesBack(state) {
  return state.pendingProgrammaticPops > 0 || state.entries.length > 0
}

/**
 * Whether the Module's own rewind is still in flight. A Back press in that window is
 * absorbed without moving history: the pending pop is the one that must be consumed,
 * or the browser walks one entry too far.
 * @param {SheetHistoryState} state
 * @returns {boolean}
 */
export function isProgrammaticRewindPending(state) {
  return state.pendingProgrammaticPops > 0
}

/**
 * Whether a consumed Back press should move browser history. A locked sheet keeps its own
 * history entry while it stays open, so its Back press is absorbed without a rewind; the
 * entry is rewound when the sheet is eventually closed (ADR 0036).
 * @param {SheetHistoryState} state
 * @returns {boolean}
 */
export function backRewindsHistory(state) {
  if (isProgrammaticRewindPending(state)) return false
  const top = state.entries[state.entries.length - 1]
  return !!top && !top.locked
}

/**
 * Whether the popped entry belongs to the sheet currently on top.
 * @param {SheetHistoryEntry | undefined} popped
 * @param {SheetDescriptor | undefined} top
 * @returns {boolean}
 */
function popIsTopSheet(popped, top) {
  return !!popped?.backEligible && top?.id === popped.sheetId
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
    const entries = state.entries.map(entry => ({
      ...entry,
      backEligible: closedIds.includes(entry.sheetId) ? false : entry.backEligible,
    }))
    for (const sheet of openedSheets) {
      entries.push({ sheetId: sheet.id, openedHref: action.href, backEligible: true, locked: !!sheet.locked })
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
    const top = action.sheets[action.sheets.length - 1]
    const entries = state.entries.slice(0, -1)
    /** @type {SheetHistoryEffect[]} */
    const effects = []
    if (popIsTopSheet(popped, top)) {
      // The browser has already walked back off a locked sheet's entry. Keep the
      // Module's entry and re-push the browser one so the sheet stays on its page.
      if (top.locked) return { state, effects: [{ type: 'push' }] }
      effects.push({ type: 'close', id: top.id })
    }
    const rewind = drainTombstones(entries, action.href)
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
