import { describe, it, expect } from 'vitest'
import bodyPaths from './body-paths.js'
import { levelsOf, MUSCLE_NAME } from './muscles.js'

// The single deltoid shape each view drew before the heads were split (ADR 0024).
// The heads must stay inside this outline, never overlap, and leave only the thin
// seam between heads that every other muscle on the map has.
const OLD_DELTOIDS = {
  'male': {
    'front': [
      'M274.06 311.69q3.94 2.77 4.33 8.14.04.48-.38.73c-9.98 5.88-24.35 7.45-28.82 19.75-2.31 6.36-.97 17.35-1.43 23.68q-.55 7.51-5.73 14.07-10.37 13.11-13.81 16.67c-3.41 3.53-6.81 1.76-10.69-.47-15.42-8.87-24.95-25.45-22.52-43.22 2.05-14.92 12.71-25.79 24.06-35.02 16.99-13.82 35.58-17.99 54.99-4.33z',
      'M450.39 320.75q-.95-.52-.7-1.58c1.57-6.61 5.8-9.1 12.14-11.9 24.99-11.03 43.76 3.33 60.17 20.74 20.73 21.99 11.81 56.44-14.82 68.19-4.41 1.94-6.79-1.03-9.81-4.51-5.81-6.7-13.46-14.12-15.99-22.8-3.93-13.43 4.32-27.54-9.64-37.62q-8.22-5.93-17.99-9.08-1.84-.59-3.36-1.44z'
    ],
    'back': [
      'M980.66 319.58c.19.14.55.19.65.32a.8.8 0 01-.16 1.15c-6.78 4.75-15.26 9.77-20.03 15.58-6.41 7.78-8.76 16.96-9.44 27.04-.39 5.92-1.68 9.5-5.59 13.43-10.02 10.08-19.04 16.47-31.14 20.41q-.75.25-.75-.55.19-18.4-.09-36.3-.14-9.4 1.07-14.22c4.04-16.07 22.8-33.85 39.68-35.64 9.99-1.06 17.34 2.46 25.8 8.78z',
      'M1227.3 316.44c14.62 9.44 25.48 21.03 25.46 39.51q-.02 20.56-.01 41.37a.37.37 0 01-.51.35c-5.08-2.06-10.41-3.98-14.9-6.97-7.84-5.24-21.14-14.95-21.77-24.95-.69-10.75-2.81-20.85-9.76-29.25-4.68-5.65-12.96-10.58-19.6-15.26q-1.23-.87.01-1.71c4.6-3.13 9.91-6.78 15.25-7.98q13.58-3.03 25.83 4.89z'
    ]
  },
  'female': {
    'front': [
      'm 215.94,289.45 c -21.5,15.97 -35.81,41.69 -45.18,66.64 a 0.54,0.54 0 0 1 -0.75,0.3 c -1.36,-0.68 -2.91,-1.32 -2.88,-3.16 q 0.36,-18.38 4.6,-33.36 c 4.12,-14.55 12.32,-23.54 25.35,-31.51 5.06,-3.09 15.01,-5.79 18.99,0.41 a 0.51,0.51 0 0 1 -0.13,0.68 z',
      'm 233,326.79 c -5.53,27.66 -26.78,45.52 -55.22,43.68 a 0.54,0.54 0 0 1 -0.5,-0.61 c 4.48,-32.74 28.09,-58.38 54.53,-76.41 q 2.3,-1.57 4.86,-0.86 a 1.61,1.61 0 0 1 1.18,1.72 Q 236,311.81 233,326.79 Z',
      'M 470.13,355.96 C 463.5,338.45 454.92,322.09 443.6,307.63 q -8.16,-10.43 -18.47,-18.02 a 0.95,0.94 33.2 0 1 -0.26,-1.22 c 3.34,-5.94 13.06,-3.27 17.74,-0.68 13.57,7.5 23.02,17.38 27.32,32.28 q 3.99,13.8 4.29,33.5 0.02,0.68 -0.47,1.17 -1.06,1.07 -2.71,1.71 a 0.71,0.71 0 0 1 -0.91,-0.41 z',
      'm 463.02,370.48 c -23.85,1.37 -44.22,-11.24 -52.35,-33.91 q -2.31,-6.45 -3.64,-14.34 -2.64,-15.63 -3.89,-27.26 -0.28,-2.56 2.36,-2.63 1.96,-0.05 4.36,1.61 c 25.95,18.03 49.33,43.22 53.78,75.78 q 0.1,0.71 -0.62,0.75 z'
    ],
    'back': [
      'm 1015.26,291.32 c 13.82,-8.28 31.54,1.05 42.43,10.31 a 0.79,0.78 46.2 0 1 -0.02,1.22 c -24.49,19.25 -48.03,41.91 -64.52,68.41 q -0.81,1.29 -0.91,-0.22 c -0.55,-8.02 -1.66,-16.16 -1.47,-24.04 q 0.34,-14.94 4.17,-28.72 4.91,-17.72 20.32,-26.96 z',
      'm 1269.98,290.8 c 13.79,8.38 20.48,19.55 22.26,34.89 1.11,9.5 1.29,18.77 0.46,28.54 q -0.73,8.56 -1.29,17.08 -0.08,1.29 -0.8,0.22 c -16.86,-25.21 -37.38,-47.58 -59.38,-68.88 q -0.46,-0.45 0,-0.88 c 9.46,-8.91 18.65,-15.05 32.34,-13.43 2.34,0.28 4.42,1.25 6.41,2.46 z'
    ]
  }
}

// Flattens an SVG path into polygons (one per subpath). Curves are sampled;
// the tiny arcs in this data are taken as straight lines.
function flatten(d) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g)
  const polys = []
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, poly = null, prev = ''
  const num = () => +toks[i++]
  // Arc flags may be packed against the next number ("01-.16").
  const flag = () => { const t = toks[i]; if (t.length > 1) { toks[i] = t.slice(1); return } i++ }
  const sample = (pts, n = 12) => {
    for (let k = 1; k <= n; k++) {
      const t = k / n
      let p = pts.map(q => q.slice())
      while (p.length > 1) p = p.slice(1).map((q, j) => [p[j][0] + (q[0] - p[j][0]) * t, p[j][1] + (q[1] - p[j][1]) * t])
      poly.push(p[0])
    }
  }
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase()
    const ox = rel ? x : 0, oy = rel ? y : 0
    if (C === 'M') {
      x = ox + num(); y = oy + num(); sx = x; sy = y
      poly = [[x, y]]; polys.push(poly); cmd = rel ? 'l' : 'L'
    } else if (C === 'L') { x = ox + num(); y = oy + num(); poly.push([x, y]) }
    else if (C === 'H') { x = ox + num(); poly.push([x, y]) }
    else if (C === 'V') { y = oy + num(); poly.push([x, y]) }
    else if (C === 'C' || C === 'S') {
      const c1 = C === 'C' ? [ox + num(), oy + num()] : (/[CS]/i.test(prev) ? [2 * x - cx, 2 * y - cy] : [x, y])
      const c2 = [ox + num(), oy + num()], e = [ox + num(), oy + num()]
      sample([[x, y], c1, c2, e]); [cx, cy] = c2; [x, y] = e
    } else if (C === 'Q' || C === 'T') {
      const c1 = C === 'Q' ? [ox + num(), oy + num()] : (/[QT]/i.test(prev) ? [2 * x - cx, 2 * y - cy] : [x, y])
      const e = [ox + num(), oy + num()]
      sample([[x, y], c1, e]); [cx, cy] = c1; [x, y] = e
    } else if (C === 'A') { i += 3; flag(); flag(); x = ox + num(); y = oy + num(); poly.push([x, y]) }
    else if (C === 'Z') { x = sx; y = sy }
    else throw new Error('unknown command ' + cmd)
    prev = C
  }
  return polys
}

// A shape is its polygons plus their bounding box, so most sample points skip the ray test.
function shape(paths) {
  const polys = paths.flatMap(flatten)
  const pts = polys.flat()
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
  return { polys, box: pts.length ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] : [0, -1, 0, -1] }
}

const inside = ({ polys, box }, px, py) => {
  if (px < box[0] || px > box[1] || py < box[2] || py > box[3]) return false
  let n = 0
  for (const p of polys) for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
    const [xa, ya] = p[a], [xb, yb] = p[b]
    if ((ya > py) !== (yb > py) && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) n++
  }
  return n % 2 === 1
}

// Grid-samples the old outline's box: how many points fall in the old shape,
// in no head, in more than one head, outside the old shape but in a head,
// and in each head.
function coverage(oldPaths, headPaths) {
  const old = shape(oldPaths)
  const heads = headPaths.map(d => shape([d]))
  const [x0, x1, y0, y1] = old.box
  let inOld = 0, gap = 0, overlap = 0, stray = 0
  const step = 0.75
  for (let px = x0 - 2; px <= x1 + 2; px += step) for (let py = y0 - 2; py <= y1 + 2; py += step) {
    const o = inside(old, px, py)
    const hits = heads.filter(h => inside(h, px, py)).length
    if (o) { inOld++; if (!hits) gap++ }
    else if (hits) stray++
    if (hits > 1) overlap++
  }
  return { inOld, gap, overlap, stray }
}

const VIEW_HEADS = { front: ['front-delts', 'side-delts'], back: ['rear-delts', 'side-delts'] }

describe('shoulder heads on the body map', () => {
  for (const model of ['male', 'female']) {
    for (const view of ['front', 'back']) {
      const p = bodyPaths[model][view].p

      it(`${model} ${view} draws ${VIEW_HEADS[view].join(' and ')} and no other shoulder shape`, () => {
        for (const head of VIEW_HEADS[view]) expect(p[head]?.length, `${model}.${view}.${head}`).toBeGreaterThan(0)
        const other = view === 'front' ? 'rear-delts' : 'front-delts'
        expect(p[other]).toBeUndefined()
        expect(p.deltoids).toBeUndefined()
      })

      it(`${model} ${view} heads keep the old deltoid silhouette, split by a thin seam, with no overlap`, () => {
        const heads = VIEW_HEADS[view].flatMap(head => p[head] || [])
        const { inOld, gap, overlap, stray } = coverage(OLD_DELTOIDS[model][view], heads)
        expect(inOld).toBeGreaterThan(500)
        expect(gap / inOld).toBeLessThan(0.08)
        expect(overlap / inOld).toBeLessThan(0.01)
        expect(stray / inOld).toBeLessThan(0.01)
      })

      it(`${model} ${view} gives each head a real share of the shoulder`, () => {
        const { inOld } = coverage(OLD_DELTOIDS[model][view], [])
        for (const head of VIEW_HEADS[view]) {
          const own = coverage(p[head] || [], [])
          expect(own.inOld / inOld, head).toBeGreaterThan(0.2)
        }
      })
    }
  }

  it('shades each head from its own load', () => {
    const levels = levelsOf({ 'front-delts': 0, 'side-delts': 10, 'rear-delts': 2 })
    expect(levels['side-delts']).toBe(4)
    expect(levels['front-delts']).toBe(0)
    expect(levels['rear-delts']).toBeGreaterThan(0)
    expect(levels['rear-delts']).toBeLessThan(4)
    expect(MUSCLE_NAME['side-delts']).toBe('Side delts')
  })
})
