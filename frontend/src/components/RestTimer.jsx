import { useEffect } from 'react'
import { useUI } from '../store/useUI.js'
import { fmtSec, fmtSigned } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'

export default function RestTimer() {
  const timer = useUI(s => s.timer)
  const work = useUI(s => s.work)
  const { addRest, stopRest, finishWorkEarly, stopWork } = useUI()
  const on = work || timer
  useEffect(() => {
    document.body.classList.toggle('resting', !!on)
    return () => document.body.classList.remove('resting')
  }, [!!on])
  if (!on) return null
  const scale = on.total > 0 ? Math.max(0, Math.min(1, on.left / on.total)) : 0
  const bar = <div className="bar"><i style={{ transform: `scaleX(${scale})` }} /></div>

  if (work) return (
    <div id="timer" className="working" role="timer">
      {bar}
      <div className="t">{fmtSec(work.left)}</div>
      <div className="grow">{work.label && <div className="lbl">{work.label}</div>}</div>
      <div className="acts">
        <Button size="sm" onClick={stopWork}>{t('Cancel')}</Button>
        <Button size="sm" variant="primary" icon="check" onClick={finishWorkEarly}>{t('Done')}</Button>
      </div>
    </div>
  )
  return (
    <div id="timer" className="rest" role="timer">
      {bar}
      <div className="t">{fmtSec(timer.left)}</div>
      <div className="acts">
        <Button size="sm" onClick={() => addRest(-15)}>{t('{0}s', fmtSigned(-15))}</Button>
        <Button size="sm" onClick={() => addRest(15)}>{t('{0}s', fmtSigned(15))}</Button>
        <Button size="sm" variant="primary" className="skip" onClick={stopRest}>{t('Skip')}</Button>
      </div>
    </div>
  )
}
