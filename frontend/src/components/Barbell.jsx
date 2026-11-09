import { platesFor, plateCaption, plateTone } from '../lib/plates.js'

// Equipment whose load actually goes on a straight bar. EZ, trap and Smith bars have their own
// unlabelled weights, so drawing them on a 20 kg bar would state something the log cannot know.
const STRAIGHT_BARS = new Set(['barbell', 'olympic barbell'])

/** Whether a set on this equipment can be drawn as plates on a bar. */
export const loadsOnBar = eq => STRAIGHT_BARS.has(eq)

// Drawn sizes per plate rank. The whole set is stepped, big to small, the way the mark's own
// two steps are: this is the Sky mark with the lifter's real numbers on it.
const HEIGHT = { big: 52, mid: 44, small: 34, tiny: 26, change: 20 }
function sizeOf(plate, unit) {
  const r = unit === 'lb' ? plate / 2.25 : plate
  if (r >= 20) return 'big'
  if (r >= 15) return 'mid'
  if (r >= 10) return 'small'
  if (r >= 5) return 'tiny'
  return 'change'
}

/**
 * A barbell loaded with the plates for one set, in the competition colour code, with its
 * reading in words beside it so the colours are never the only way to read it.
 * @param {number} weight - Total load including the bar.
 * @param {string} unit - Profile weight unit.
 */
export default function Barbell({ weight, unit }) {
  const load = platesFor(weight, unit)
  const caption = plateCaption(load, unit)
  const side = load.perSide.map((plate, i) => {
    const size = sizeOf(plate, unit)
    return <i key={i} className={`pl pl-${plateTone(plate, unit)} pl-${size}`} style={{ height: HEIGHT[size] }} />
  })
  return (
    <figure className="bbell" role="img" aria-label={caption}>
      <div className="bbell-bar" aria-hidden="true">
        <span className="bbell-side">{[...side].reverse()}</span>
        <span className="bbell-shaft" />
        <span className="bbell-side">{side}</span>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
