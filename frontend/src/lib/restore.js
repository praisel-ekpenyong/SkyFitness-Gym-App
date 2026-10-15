// Public restore entry point for JSON backup imports (CONTEXT.md: Restore replaces
// the current Profile wholesale on confirmation). Coordinates schema validation,
// record sanitization, and atomic state replacement.
import { validateBackup, sanitizeRestorePayload } from './storage.js'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from './i18n.js'

/**
 * Restore the application state wholesale from a parsed JSON backup file.
 *
 * Validates the backup payload against Sky's backup schema, strips malformed workout
 * or routine records, replaces active state via store `replaceState`, and emits a UI toast
 * reporting the outcome (including skipped record count if any).
 *
 * @param {Object} data - Parsed backup payload to restore.
 * @throws {Error} When data fails validation (not an object or missing backup schema markers).
 * @returns {number} Count of malformed records dropped during sanitization.
 */
export function restoreFromBackup(data) {
  validateBackup(data)
  const { clean, skipped } = sanitizeRestorePayload(data)
  const merged = Object.assign(JSON.parse(JSON.stringify(DEF)), clean)
  useStore.getState().replaceState(merged)
  if (skipped > 0) useUI.getState().toast(t('Backup imported ({0} skipped)', skipped))
  else useUI.getState().toast(t('Backup imported'))
  return skipped
}
