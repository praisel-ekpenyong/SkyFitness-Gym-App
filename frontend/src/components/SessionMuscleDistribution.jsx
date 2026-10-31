import { useState } from 'react'
import { sessionMuscleDistribution } from '../lib/muscles.js'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { Button } from './ui.jsx'

/**
 * Session muscle distribution component.
 *
 * Displays top 4 trained muscles with proportional load bars, direct vs assistance
 * set breakdowns, interactive tap-selection companion to BodyMap, and expandable disclosure.
 *
 * @param {Object} props
 * @param {Object} props.workout - Workout object with entries and sets.
 * @param {string|null} [props.selectedMuscle] - Currently selected muscle slug.
 * @param {Function} [props.onSelectMuscle] - Callback invoked when a muscle row is tapped.
 */
export default function SessionMuscleDistribution({ workout, selectedMuscle, onSelectMuscle }) {
  const [expanded, setExpanded] = useState(false)
  const distribution = sessionMuscleDistribution(workout)

  if (distribution.length === 0) {
    return <div className="muted small">{t('No performed work sets in this session')}</div>
  }

  const maxEffective = Math.max(...distribution.map(m => m.effectiveSets), 0)
  const visible = expanded ? distribution : distribution.slice(0, 4)

  return (
    <div className="session-muscle-distribution" style={{ textAlign: 'left' }}>
      {visible.map(m => {
        const isSelected = selectedMuscle === m.slug
        const width = maxEffective > 0 ? Math.round((m.effectiveSets / maxEffective) * 100) + '%' : '0%'

        let subtitle = ''
        if (m.primarySets > 0 && m.assistSets > 0) {
          subtitle = t('{0} direct + {1} assist', fmtNum(m.primarySets), fmtNum(m.assistSets))
        } else if (m.primarySets > 0) {
          subtitle = t('{0} direct sets', fmtNum(m.primarySets))
        } else if (m.assistSets > 0) {
          subtitle = t('{0} assist ({1} compound sets)', fmtNum(m.assistSets), m.compoundSets)
        }

        return (
          <div
            key={m.slug}
            className={'smd-row mrow' + (onSelectMuscle ? ' tappable' : '') + (isSelected ? ' selected' : '')}
            role={onSelectMuscle ? 'button' : undefined}
            tabIndex={onSelectMuscle ? 0 : undefined}
            aria-pressed={onSelectMuscle ? isSelected : undefined}
            onClick={onSelectMuscle ? () => onSelectMuscle(m.slug) : undefined}
            onKeyDown={onSelectMuscle ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectMuscle(m.slug)
              }
            } : undefined}
          >
            <div className="smd-info grow" style={{ minWidth: 0 }}>
              <div className="smd-name nm" style={{ fontWeight: 500, color: 'var(--label)' }}>
                {t(m.name)}
              </div>
              {subtitle && (
                <div className="smd-sub ss muted small" style={{ fontSize: 12, color: 'var(--label-2)' }}>
                  {subtitle}
                </div>
              )}
            </div>
            <span className="bar">
              <i style={{ width }} />
            </span>
            <span className="v">{t('{0} sets', fmtNum(m.effectiveSets))}</span>
          </div>
        )
      })}

      {distribution.length > 4 && (
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? t('Show less') : t('Show all ({0})', distribution.length)}
          </Button>
        </div>
      )}
    </div>
  )
}

export { SessionMuscleDistribution }
