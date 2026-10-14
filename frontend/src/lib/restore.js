// Restore entry point — the public store-plus-restore seam a lifter crosses
// when loading a full JSON backup file (CONTEXT.md: Restore replaces the
// current Profile wholesale on confirmation).
//
// validateBackup rejects non-backups, sanitizeRestorePayload strips malformed
// Workout and Routine elements (and malformed Entries inside good ones) with
// a skipped count, then the cleaned Profile lands via the store's public
// replaceState and the outcome is announced as a visible toast.
import { validateBackup, sanitizeRestorePayload } from './storage.js'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from './i18n.js'

export function restoreFromBackup(data) {
  validateBackup(data)
  const { clean, skipped } = sanitizeRestorePayload(data)
  const merged = Object.assign(JSON.parse(JSON.stringify(DEF)), clean)
  useStore.getState().replaceState(merged)
  if (skipped > 0) useUI.getState().toast(t('Backup imported ({0} skipped)', skipped))
  else useUI.getState().toast(t('Backup imported'))
  return skipped
}
