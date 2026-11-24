import { Button } from '../components/ui.jsx'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'

function ConfirmDialog({ title, message, confirmText, cancelText, danger, onConfirm, close }) {
  return (
    <div className="confirm">
      {title && <h3>{title}</h3>}
      <div className="confirm-msg">{message}</div>
      <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={() => { close(); if (onConfirm) onConfirm() }}>
        {confirmText || t('Confirm')}
      </button>
      <Button variant="ghost" onClick={close}>{cancelText || t('Cancel')}</Button>
    </div>
  )
}

/**
 * Themed replacement for window.confirm — callback-based (no blocking).
 */
export function confirmSheet(opts) {
  useUI.getState().openSheet(close => <ConfirmDialog {...opts} close={close} />, { kind: 'center', label: opts.title || t('Confirm') })
}
