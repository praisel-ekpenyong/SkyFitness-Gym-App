import { platesFor, plateCaption, plateTone, plateSize } from '../lib/plates.js'

const STRAIGHT_BARS = new Set(['barbell', 'olympic barbell'])

export const loadsOnBar = eq => STRAIGHT_BARS.has(eq)

const HEIGHT = { big: 52, mid: 44, small: 34, tiny: 26, change: 20 }

export default function Barbell({ weight, unit }) {
  const load = platesFor(weight, unit)
  const caption = plateCaption(load, unit)
  const side = load.perSide.map((plate, i) => {
    const size = plateSize(plate, unit)
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
