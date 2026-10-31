import { useEffect, useState } from 'react'
import { MUSCLES, INERT, MUSCLE_NAME, levelsOf } from '../lib/muscles.js'
import { t } from '../lib/i18n.js'

// Front and back views of a body, each muscle shaded by how hard it was worked.
//
// The five shade steps are the same ones the activity heatmap uses (.hm-c.l0…l4), so
// "more accent = more training" means one thing everywhere in the app rather than two.
//
// The geometry is ~90 KB and only some screens show a map, so it is fetched on first
// render instead of riding along in the main bundle. Until it lands the component
// renders nothing but keeps its height, so nothing below it jumps on arrival.

let CACHE = null                                  // shared across every mounted map
let PENDING = null

/**
 * Loads the body-map SVG geometry once (shared across every mounted map) and returns it, or null until it arrives.
 * @returns {Object|null} Muscle-path geometry by body and view, or null while loading.
 */
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

/**
 * One front/back body silhouette with each muscle shaded by its training level; interactive only when a muscle callback is given.
 * Interactive muscles expose a single keyboard tab stop with a localized name; supplementary paths stay out of the accessibility tree.
 * @param {Object} view - View geometry (viewBox plus per-muscle paths).
 * @param {string} viewKey - Which view this is ("front" or "back").
 * @param {Object} levels - Shade level per muscle slug.
 * @param {Function} [onMuscle] - Called with the muscle slug when a muscle is picked; omitting it renders a static image.
 * @param {string} [selected] - Currently selected muscle slug.
 * @param {Function} [primaryOf] - Resolves which view holds the keyboard stop for a muscle.
 */
function View({ view, viewKey, levels, onMuscle, selected, primaryOf, getA11yLabel }) {
  return (
    <svg className="bm-v" viewBox={view.vb} role={onMuscle ? 'group' : 'img'} aria-label={onMuscle ? t('Body map') : t('Trained muscles map')}>
      {INERT.map(slug => (view.p[slug] || []).map((d, i) =>
        <path key={slug + i} className="bm-sil" d={d} aria-hidden="true" />))}
      {MUSCLES.map(slug => (view.p[slug] || []).map((d, i) => {
        // One keyboard stop per drawable muscle across both views: the front
        // instance is primary when the muscle is drawn there, otherwise the
        // back instance. Supplementary paths stay mouse-clickable but leave
        // the accessibility tree so the muscle is announced exactly once.
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

/**
 * <BodyMap load={{ chest: 12, … }} body="male" />
 * `load` is effective sets per muscle (see lib/muscles.js); shading is relative to
 * the hardest-worked muscle in that same load, so it always reads as a balance. Pass ordered
 * `{ at, level, exclusive? }` `thresholds` for a fixed absolute scale (recovery views use this
 * to keep their semantic bands stable); omitting it preserves the balance behavior.
 */
export default function BodyMap({ load = {}, thresholds, body = 'male', onMuscle, selected, className = '', getA11yLabel }) {
  const paths = useBodyPaths()
  const levels = levelsOf(load, thresholds)
  const g = paths && (paths[body] || paths.male)
  // Front wins when a muscle is drawn in both views, so each drawable muscle
  // keeps exactly one keyboard tab stop across the two views.
  const primaryOf = slug => (g.front.p[slug] ? 'front' : 'back')
  return (
    <div className={'bodymap ' + className} role={!onMuscle ? 'img' : undefined} aria-label={!onMuscle ? t('Trained muscles map') : undefined}>
      {g ? <>
        <View view={g.front} viewKey="front" levels={levels} onMuscle={onMuscle} selected={selected} primaryOf={primaryOf} getA11yLabel={getA11yLabel} />
        <View view={g.back} viewKey="back" levels={levels} onMuscle={onMuscle} selected={selected} primaryOf={primaryOf} getA11yLabel={getA11yLabel} />
      </> : <div className="bm-ph" aria-hidden="true" />}
    </div>
  )
}

/**
 * Less-to-More shade key matching the map and activity heatmap levels; use alongside BodyMap.
 */
export function BodyMapLegend() {
  return <div className="hm-legend">
    {t('Less')} <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" />
    <div className="hm-c l3" /><div className="hm-c l4" /> {t('More')}
  </div>
}
