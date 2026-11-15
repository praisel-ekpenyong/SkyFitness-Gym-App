import { useEffect, useState } from 'react'
import { MUSCLES, INERT, MUSCLE_NAME, levelsOf } from '../lib/muscles.js'
import { t } from '../lib/i18n.js'


let CACHE = null
let PENDING = null

function useBodyPaths() {
  const [paths, setPaths] = useState(CACHE)
  useEffect(() => {
    if (CACHE) return
    let alive = true
    PENDING = PENDING || import('../lib/body-paths.js').then(m => (CACHE = m.default))
    PENDING.then(p => { if (alive) setPaths(p) }).catch(() => {})
    return () => { alive = false }
  }, [])
  return paths
}

function View({ view, viewKey, levels, onMuscle, selected, primaryOf, getA11yLabel }) {
  return (
    <svg className="bm-v" viewBox={view.vb} role={onMuscle ? 'group' : 'img'} aria-label={onMuscle ? t('Body map') : t('Trained muscles map')}>
      {INERT.map(slug => (view.p[slug] || []).map((d, i) =>
        <path key={slug + i} className="bm-sil" d={d} aria-hidden="true" />))}
      {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) => {
        const isPrimary = !!onMuscle && i === 0 && primaryOf(slug) === viewKey
        const label = isPrimary
          ? (getA11yLabel ? getA11yLabel(slug, levels[slug]) : t(MUSCLE_NAME[slug]))
          : undefined
        return (
          <path
            key={slug + i}
            role={isPrimary ? 'button' : undefined}
            tabIndex={isPrimary ? 0 : undefined}
            focusable={isPrimary ? undefined : 'false'}
            aria-label={label}
            aria-hidden={!isPrimary && onMuscle ? true : undefined}
            aria-pressed={isPrimary ? (selected === slug) : undefined}
            className={'bm-m l' + (levels[slug] || 0) + (selected === slug ? ' sel' : '')}
            d={d}
            onClick={onMuscle ? () => onMuscle(slug) : undefined}
            onKeyDown={isPrimary ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMuscle(slug) } } : undefined}
          >
            {isPrimary ? <title>{label}</title> : null}
          </path>
        )
      }))}
    </svg>
  )
}

export default function BodyMap({ load = {}, thresholds, body = 'male', onMuscle, selected, className = '', getA11yLabel }) {
  const paths = useBodyPaths()
  const levels = levelsOf(load, thresholds)
  const g = paths && (paths[body] || paths.male)
  const primaryOf = slug => (g.front.p[slug] ? 'front' : 'back')
  const trainedCount = !onMuscle ? Object.keys(load || {}).filter(k => (load[k] || 0) > 0).length : 0
  const staticAriaLabel = !onMuscle
    ? (trainedCount > 0 ? t('Trained muscles map ({0} muscles trained)', trainedCount) : t('Trained muscles map'))
    : undefined
  return (
    <div className={'bodymap ' + className} role={!onMuscle ? 'img' : undefined} aria-label={staticAriaLabel}>
      {g ? <>
        <View view={g.front} viewKey="front" levels={levels} onMuscle={onMuscle} selected={selected} primaryOf={primaryOf} getA11yLabel={getA11yLabel} />
        <View view={g.back} viewKey="back" levels={levels} onMuscle={onMuscle} selected={selected} primaryOf={primaryOf} getA11yLabel={getA11yLabel} />
      </> : <div className="bm-ph" aria-hidden="true" />}
    </div>
  )
}

export function BodyMapLegend() {
  return <div className="hm-legend">
    {t('Less')} <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" />
    <div className="hm-c l3" /><div className="hm-c l4" /> {t('More')}
  </div>
}
