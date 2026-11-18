import { DEF, validateBackup, sanitizeRestorePayload } from '../lib/profile/index.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'

const defClone = () => JSON.parse(JSON.stringify(DEF))

// No DEF overlay before replaceState: `admit` fills absent fields, and an overlay would hide a
// backup's missing `schemaVersion`, so its upgrades would not run.
export function restoreFromBackup(data) {
  validateBackup(data)
  const { clean, skipped } = sanitizeRestorePayload(data)
  useStore.getState().replaceState(clean)
  if (skipped > 0) useUI.getState().toast(t('Backup imported ({0} skipped)', skipped))
  else useUI.getState().toast(t('Backup imported'))
  return skipped
}

export function resetProfile() {
  useStore.getState().replaceState(defClone())
}
