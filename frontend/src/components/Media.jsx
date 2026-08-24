import { useState } from 'react'
import { mediaSrc } from '../lib/exercises.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// Big autoplaying animation; tap toggles to the still frame. `compact` shrinks it (superset cards).
// Custom exercises have no media — the animation stays blank by design (issue #11).
// `minimizable` (workout view) adds a persistent minimize/expand control so the animation stops
// eating the screen; the chosen size is saved to settings and carries across exercises and
// future workouts (issue #12).
export default function Media({ ex, id, compact, minimizable }) {
  const [playing, setPlaying] = useState(true)
  const [failed, setFailed] = useState({ gif: false, img: false })
  const [lastId, setLastId] = useState(ex?.id)
  if (ex?.id !== lastId) {
    setLastId(ex?.id)
    setFailed({ gif: false, img: false })
  }

  const gifSize = useStore(s => s.S.gifSize)
  const update = useStore(s => s.update)
  if (!ex?.gif) return null
  const mini = minimizable && gifSize === 'mini'
  const toggleSize = e => { e.stopPropagation(); update(s => { s.gifSize = mini ? 'full' : 'mini' }) }

  const mode = playing ? 'gif' : 'img'
  const currentSrc = mediaSrc(ex, { playing, fallback: failed[mode] })
  const fallbackSrc = mediaSrc(ex, { playing, fallback: true })

  const handleError = () => {
    if (!failed[mode] && fallbackSrc) {
      setFailed(f => ({ ...f, [mode]: true }))
    }
  }

  return (
    <div className={'exmedia' + (compact ? ' compact' : '') + (mini ? ' mini' : '')} id={id} onClick={() => setPlaying(p => !p)}>
      <img decoding="async" src={currentSrc} onError={handleError} alt={ex.n} />
      {minimizable && (
        <button className="giftoggle" onClick={toggleSize}>
          <Icon name={mini ? 'expand' : 'minimize'} />{mini ? t('Expand') : t('Minimize')}
        </button>
      )}
      {!mini && (
        <span className="gifhint">
          <Icon name={playing ? 'pause' : 'play'} />{playing ? t('tap to pause') : t('tap to play')}
        </span>
      )}
    </div>
  )
}

export function Thumb({ ex }) {
  const [failed, setFailed] = useState(false)
  const [lastId, setLastId] = useState(ex?.id)
  if (ex?.id !== lastId) {
    setLastId(ex?.id)
    setFailed(false)
  }

  if (!ex?.img) return <div className="thumb thumb-x"><Icon name="dumbbell" /></div>
  const currentSrc = mediaSrc(ex, { fallback: failed })

  return (
    <img
      className="thumb"
      loading="lazy"
      decoding="async"
      src={currentSrc}
      onError={() => { if (!failed) setFailed(true) }}
      alt=""
    />
  )
}
