import { useState } from 'react'
import { mediaSrc } from '../lib/exercises.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

// The URLs to try in turn: the bundled file, then the CDN copy. A build without bundled media
// already points the first at the CDN, so the copy is dropped rather than tried twice.
const sources = (ex, playing) =>
  [...new Set([mediaSrc(ex, { playing }), mediaSrc(ex, { playing, fallback: true })])].filter(Boolean)

// Big autoplaying animation; tap toggles to the still frame. `compact` shrinks it (superset cards).
// Custom exercises have no media — the animation stays blank by design (issue #11). When both the
// bundled file and the CDN copy fail, the dumbbell tile stands in, with no <img> and so no alt text painted.
// `minimizable` (workout view) adds a persistent minimize/expand control so the animation stops
// eating the screen; the chosen size is saved to settings and carries across exercises and
// future workouts (issue #12).
export default function Media({ ex, id, compact, minimizable }) {
  const [playing, setPlaying] = useState(true)
  // Failures so far, per format: an index into `sources`. The clip and the still fail independently.
  const [tries, setTries] = useState({ gif: 0, img: 0 })
  const [lastId, setLastId] = useState(ex?.id)
  if (ex?.id !== lastId) {
    setLastId(ex?.id)
    setPlaying(true)
    setTries({ gif: 0, img: 0 })
  }

  const gifSize = useStore(s => s.S.gifSize)
  const update = useStore(s => s.update)
  if (!ex?.gif) return null
  const mini = minimizable && gifSize === 'mini'
  const toggleSize = e => { e.stopPropagation(); update(s => { s.gifSize = mini ? 'full' : 'mini' }) }

  const format = playing ? 'gif' : 'img'
  const urls = sources(ex, playing)
  const currentSrc = urls[tries[format]]
  const handleError = () => setTries(n => ({ ...n, [format]: Math.min(n[format] + 1, urls.length) }))

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
        ? <div className="thumb-x"><Icon name="dumbbell" /></div>
        : <img loading="lazy" decoding="async" crossOrigin="anonymous" width={size} height={size} src={currentSrc} onError={handleError} alt={ex.n} />}
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

/**
 * Small still exercise thumbnail for list rows. Shows the dumbbell tile when the exercise has no image, or when
 * both the bundled file and the CDN copy fail to load.
 * Decorative (empty alt text); the surrounding row already names the exercise.
 * @param {Object} ex - Exercise with optional image sources and id.
 */
export function Thumb({ ex }) {
  // Failures so far: an index into `sources`; past the end, every URL failed (no signal, or the file is gone).
  const [tries, setTries] = useState(0)
  const [lastId, setLastId] = useState(ex?.id)
  if (ex?.id !== lastId) {
    setLastId(ex?.id)
    setTries(0)
  }

  const urls = sources(ex, false)
  const currentSrc = urls[tries]
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
      onError={() => setTries(n => Math.min(n + 1, urls.length))}
      alt=""
    />
  )
}
