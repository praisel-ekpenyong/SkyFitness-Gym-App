// The one interpreter of sheet-versus-history decisions. The pure transition lives in
// lib/sheet-history.js; this module owns the two subscriptions, the Back handle and the
// order in which effects reach the injected Adapters. Nothing here imports the store.
import { createSheetHistoryState, consumesBack, isProgrammaticRewindPending, transitionSheetHistory } from '../lib/sheet-history.js'

/** @typedef {{ id: string, locked?: boolean }} SheetDescriptor */
/**
 * @typedef {{
 *   subscribe: (handler: (sheets: SheetDescriptor[]) => void) => () => void,
 *   getSheets: () => SheetDescriptor[],
 *   closeSheet: (id: string) => void
 * }} SheetsAdapter
 */
/**
 * @typedef {{
 *   href: () => string,
 *   push: () => void,
 *   rewind: (count: number) => void,
 *   onPop: (handler: () => void) => () => void
 * }} BrowserHistoryAdapter
 */
/** @typedef {{ install: (handle: () => boolean) => () => void }} BackAdapter */
/** @typedef {{ sheets: SheetsAdapter, history: BrowserHistoryAdapter, back: BackAdapter }} SheetHistoryHost */
/** @typedef {{ type: 'sheets-changed', sheets: SheetDescriptor[], href: string }} SheetsChangedAction */
/** @typedef {{ type: 'pop', sheets: SheetDescriptor[], href: string }} PopAction */
/** @typedef {SheetsChangedAction | PopAction} SheetHistoryTransition */

/**
 * Attach the one sheet-history Module. The Back handle is installed here, at attach
 * time, and returns only whether it consumed the press.
 * @param {SheetHistoryHost} host
 * @returns {() => void} idempotent disposer: unsubscribes both listeners and unregisters only this handle
 */
export function createSheetHistory(host) {
  let state = createSheetHistoryState()
  let disposed = false

  /**
   * @param {SheetHistoryTransition} action
   */
  const apply = action => {
    const result = transitionSheetHistory(state, action)
    // Commit first: closing a sheet re-enters the sheets subscription synchronously.
    state = result.state
    for (const effect of result.effects) {
      if (effect.type === 'push') host.history.push()
      else if (effect.type === 'rewind') host.history.rewind(effect.count)
      else if (effect.type === 'close') host.sheets.closeSheet(effect.id)
      else throw new TypeError('Unknown sheet history effect')
    }
  }

  const onSheetsChanged = () => {
    apply({ type: 'sheets-changed', sheets: host.sheets.getSheets(), href: host.history.href() })
  }
  const onPop = () => {
    apply({ type: 'pop', sheets: host.sheets.getSheets(), href: host.history.href() })
  }
  const onBack = () => {
    if (disposed) return false
    // The Module's own rewind is still in flight: absorb the press so the pending
    // pop is consumed by that rewind, not by an extra one.
    if (isProgrammaticRewindPending(state)) return true
    // A hardware press is the same Back as a browser pop: step one browser entry
    // through the one interpreter, which closes the sheet and drains tombstones.
    const consumed = consumesBack(state)
    if (consumed) host.history.rewind(1)
    return consumed
  }

  const unsubscribeSheets = host.sheets.subscribe(onSheetsChanged)
  const unsubscribePop = host.history.onPop(onPop)
  const unregisterBack = host.back.install(onBack)
  onSheetsChanged()

  return () => {
    if (disposed) return
    disposed = true
    unsubscribeSheets()
    unsubscribePop()
    unregisterBack()
  }
}
