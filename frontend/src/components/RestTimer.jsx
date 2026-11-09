import { useEffect } from 'react'
import { useUI } from '../store/useUI.js'
import { fmtSec } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'

// One dock, two meanings: the rest countdown between sets, and the Hold timer during a timed
// set (issue #16). They are mutually exclusive by construction — startWork() stops any running
// rest — so the dock can never have to show both, and the Hold gets a "Done" that logs the time
// actually held. The clock is the largest thing on the phone while it runs, on purpose: it is
// read from the bench, at arm's length, with a racing pulse.
export default function RestTimer() {
  const timer = useUI(s => s.timer)
  const work = useUI(s => s.work)
  const { addRest, stopRest, finishWorkEarly, stopWork } = useUI()
  const on = work || timer
  // The dock is fixed and floats over whatever is beneath it — during a rest that is the next
  // set's row. Extra bottom padding lets the page scroll clear.
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
  // −15 and +15 sit together in number-line order; Skip is pushed to the far edge, away from
  // the button you tap to buy more time.
  return (
    <div id="timer" className="rest" role="timer">
      {bar}
      <div className="t">{fmtSec(timer.left)}</div>
      <div className="acts">
        <Button size="sm" icon="minus" onClick={() => addRest(-15)}>15s</Button>
        <Button size="sm" icon="plus" onClick={() => addRest(15)}>15s</Button>
        <Button size="sm" variant="primary" className="skip" onClick={stopRest}>{t('Skip')}</Button>
      </div>
    </div>
  )
}
