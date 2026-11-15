import { useState } from 'react'
import { mediaSrc } from '../lib/exercises.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

const sources = (ex, playing) =>
  [...new Set([mediaSrc(ex, { playing }), mediaSrc(ex, { playing, fallback: true })])].filter(Boolean)

function useArtSource(ex, playing) {
  const [tries, setTries] = useState({ gif: 0, img: 0 })
  const [lastId, setLastId] = useState(ex?.id)
  if (ex?.id !== lastId) {
    setLastId(ex?.id)
    setTries({ gif: 0, img: 0 })
  }
  const format = playing ? 'gif' : 'img'
  const urls = sources(ex, playing)
  const onError = () => setTries(n => ({ ...n, [format]: Math.min(n[format] + 1, urls.length) }))
  return [urls[tries[format]], onError]
}

export default function Media({ ex, id, compact, minimizable }) {
  const [playing, setPlaying] = useState(true)
  const [lastId, setLastId] = useState(ex?.id)
  if (ex?.id !== lastId) {
    setLastId(ex?.id)
    setPlaying(true)
  }
  const [currentSrc, handleError] = useArtSource(ex, playing)

  const gifSize = useStore(s => s.S.gifSize)
  const update = useStore(s => s.update)
  if (!ex?.gif) return null
  const mini = minimizable && gifSize === 'mini'
  const toggleSize = e => { e.stopPropagation(); update(s => { s.gifSize = mini ? 'full' : 'mini' }) }


  const size = mini ? 84 : compact ? 120 : 320
  return (
    <div
      className={'exmedia' + (compact ? ' compact' : '') + (mini ? ' mini' : '')}
      id={id}
      role="button"
      tabIndex={0}
      aria-label={playing ? t('tap to pause') : t('tap to play')}
      onClick={() => setPlaying(p => !p)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlaying(p => !p) } }}
    >
      {!currentSrc
        ? <div className="thumb-x ex-art"><Icon name="dumbbell" /></div>
        : <img className="ex-art" loading="lazy" decoding="async" crossOrigin="anonymous" width={size} height={size} src={currentSrc} onError={handleError} alt={ex.n} />}
      {minimizable && (
        <button className="giftoggle" onClick={toggleSize} aria-label={mini ? t('Expand') : t('Minimize')}>
          <Icon name={mini ? 'expand' : 'minimize'} />
        </button>
      )}
      {!mini && (
        <span className="gifhint" aria-hidden="true"><Icon name={playing ? 'pause' : 'play'} /></span>
      )}
    </div>
  )
}

export function Thumb({ ex }) {
  const [currentSrc, handleError] = useArtSource(ex, false)
  if (!currentSrc) return <div className="thumb thumb-x"><Icon name="dumbbell" /></div>

  return (
    <img
      className="thumb"
      crossOrigin="anonymous"
      loading="lazy"
      decoding="async"
      width={50}
      height={50}
      src={currentSrc}
      onError={handleError}
      alt=""
    />
  )
}
