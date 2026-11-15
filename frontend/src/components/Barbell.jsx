import { platesFor, plateCaption, plateTone } from '../lib/plates.js'

const STRAIGHT_BARS = new Set(['barbell', 'olympic barbell'])

export const loadsOnBar = eq => STRAIGHT_BARS.has(eq)

const HEIGHT = { big: 52, mid: 44, small: 34, tiny: 26, change: 20 }
function sizeOf(plate, unit) {
  const r = unit === 'lb' ? plate / 2.25 : plate
  if (r >= 20) return 'big'
  if (r >= 15) return 'mid'
  if (r >= 10) return 'small'
  if (r >= 5) return 'tiny'
  return 'change'
}

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
