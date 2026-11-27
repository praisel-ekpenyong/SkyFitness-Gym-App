/** @typedef {{ openedAt: string, backEligible: boolean }} SheetHistoryEntry */
/** @typedef {{ id: string, locked?: boolean }} SheetDescriptor */
/** @typedef {{ sheetCount: number, entries: SheetHistoryEntry[], pushedEntries: number, pendingProgrammaticPops: number }} SheetHistoryState */
/** @typedef {{ type: 'sheets-changed', sheetCount: number, href: string } | { type: 'pop', sheets: SheetDescriptor[] }} SheetHistoryAction */
/** @typedef {{ type: 'push' } | { type: 'rewind', count: number } | { type: 'close', id: string }} SheetHistoryEffect */

/** @returns {SheetHistoryState} */
export function createSheetHistoryState() {
  return {
    sheetCount: 0,
    entries: [],
    pushedEntries: 0,
    pendingProgrammaticPops: 0,
  }
}

/**
 * @param {SheetHistoryState} state
 * @param {SheetHistoryAction} action
 * @returns {{ state: SheetHistoryState, effects: SheetHistoryEffect[] }}
 */
export function transitionSheetHistory(state, action) {
  if (action.type === 'sheets-changed') {
    const sheetCount = action.sheetCount
    if (sheetCount > state.sheetCount) {
      const added = sheetCount - state.sheetCount
      return {
        state: {
          ...state,
          sheetCount,
          entries: [
            ...state.entries,
            ...Array.from({ length: added }, () => ({ openedAt: action.href, backEligible: true })),
          ],
          pushedEntries: state.pushedEntries + added,
        },
        effects: Array.from({ length: added }, () => ({ type: 'push' })),
      }
    }

    if (sheetCount < state.sheetCount) {
      const closed = state.entries.slice(sheetCount)
      const entries = state.entries.slice(0, sheetCount)
      const rewind = closed.filter(entry => entry.backEligible && entry.openedAt === action.href).length
      return {
        state: {
          ...state,
          sheetCount,
          entries,
          pushedEntries: Math.max(0, state.pushedEntries - rewind),
          pendingProgrammaticPops: state.pendingProgrammaticPops + (rewind > 0 ? 1 : 0),
        },
        effects: rewind > 0 ? [{ type: 'rewind', count: rewind }] : [],
      }
    }

    return { state, effects: [] }
  }

  if (action.type === 'pop') {
    if (state.pendingProgrammaticPops > 0) {
      return {
        state: { ...state, pendingProgrammaticPops: state.pendingProgrammaticPops - 1 },
        effects: [],
      }
    }
    if (state.pushedEntries <= 0) return { state, effects: [] }

    let entryIndex = -1
    for (let i = state.entries.length - 1; i >= 0; i--) {
      if (state.entries[i].backEligible) {
        entryIndex = i
        break
      }
    }
    const entries = state.entries.map((entry, index) =>
      index === entryIndex ? { ...entry, backEligible: false } : entry
    )
    const top = action.sheets[action.sheets.length - 1]
    return {
      state: {
        ...state,
        entries,
        pushedEntries: state.pushedEntries - 1,
      },
      effects: entryIndex >= 0 && top && !top.locked ? [{ type: 'close', id: top.id }] : [],
    }
  }

  throw new TypeError('Unknown sheet history action')
}
