// Wholesale Profile replacement (GLOSSARY.md: Restore "replaces the current
// Profile wholesale on confirmation"). Backup import and Reset both converge
// here, on the store's `replaceState`, so validation, sanitization and
// persistence cannot drift between the two entry points.
import { validateBackup, sanitizeRestorePayload } from './storage.js'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from './i18n.js'

// The store keeps state by reference, so every replacement works on a fresh
// clone of the factory defaults — DEF itself must never end up in the atom.
const defClone = () => JSON.parse(JSON.stringify(DEF))

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
  useStore.getState().replaceState(Object.assign(defClone(), clean))
  if (skipped > 0) useUI.getState().toast(t('Backup imported ({0} skipped)', skipped))
  else useUI.getState().toast(t('Backup imported'))
  return skipped
}

/**
 * Reset the Profile wholesale to factory defaults (GLOSSARY.md: Reset — Restore
 * with no backup loaded). The confirm dialog, navigation and toast stay with
 * Settings; the replacement path is the Restore one, so normalization and
 * persistence behave identically.
 *
 * @returns {void} Nothing; the store atom is replaced in place.
 */
export function resetProfile() {
  useStore.getState().replaceState(defClone())
}
