import { glyphOf, GLYPH_GROUPS } from '../lib/glyphs.js'
import Icon, { ICON_NAMES } from '../components/Icon.jsx'
import { t } from '../lib/i18n.js'
import { ui } from './store-helpers.js'

export const glyphPicker = (current, onPick) => {
  const cur = glyphOf(current, ICON_NAMES)
  return ui().openSheet(close => (
    <>
      <h3>{t('Pick an icon')}</h3>
      {GLYPH_GROUPS.map(g => (
        <div key={g.key} className="glyph-group">
          <div className="sect-t">{t(g.key)}</div>
          <div className="glyph-grid">
            {g.items.map(n => (
              <button
                key={n}
                className={'glyph-cell' + (n === cur ? ' on' : '')}
                onClick={() => { close(); onPick(n) }}
                aria-label={n}
              >
                <Icon name={n} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="gap8" />
    </>
  ))
}
