import { Component } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'
import { confirmSheet } from '../sheets/confirm.jsx'

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.error('Sky render error:', err) }

  render() {
    if (!this.state.failed) return this.props.children
    const active = useStore.getState().S.active
    return (
      <div className="narrow">
        <div className="empty error-empty">
          <div className="ico"><Icon name="info" /></div>
          <div className="error-t d">{t('Something went wrong')}</div>
          {t('This screen could not be drawn. Your data is safe on this device.')}
        </div>
        <Button variant="primary" icon="reset" onClick={() => location.reload()}>{t('Reload Sky')}</Button>
        {active && <>
          <div className="gap8" />
          <Button variant="danger" icon="trash" onClick={() => confirmSheet({
            title: t('Discard workout?'),
            message: t('The sets you logged in this session will be lost.'),
            confirmText: t('Discard'),
            danger: true,
            onConfirm: () => {
              useStore.getState().act({ type: 'discard' })
              location.reload()
            },
          })}>{t('Discard the running workout')}</Button>
        </>}
      </div>
    )
  }
}
