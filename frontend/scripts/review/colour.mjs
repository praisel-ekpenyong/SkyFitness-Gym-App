export function parseColor(input) {
  const s = String(input).trim().toLowerCase()
  const bad = () => { throw new Error(`audit: unsupported colour syntax "${input}"`) }
  const num = (tok, scale) => {
    if (tok === 'none') return 0
    const pct = tok.endsWith('%')
    const n = Number(pct ? tok.slice(0, -1) : tok)
    if (!Number.isFinite(n) || tok === '') bad()
    return pct ? (n / 100) * scale : n
  }
  const split = body => {
    const [main, alpha, ...extra] = body.split('/')
    if (extra.length) bad()
    const parts = main.includes(',') ? main.split(',') : main.split(/\s+/)
    return { parts: parts.map(p => p.trim()).filter(Boolean), alpha: alpha === undefined ? 1 : num(alpha.trim(), 1) }
  }
  const clamp = (v, hi) => Math.min(hi, Math.max(0, v))
  let m = s.match(/^rgba?\((.*)\)$/)
  if (m) {
    const { parts, alpha } = split(m[1])
    if (parts.length === 4) parts.push(parts.pop())
    let a = alpha
    if (parts.length === 4) { a = num(parts[3], 1); parts.length = 3 }
    if (parts.length !== 3) bad()
    return [...parts.map(p => clamp(num(p, 255), 255)), clamp(a, 1)]
  }
  m = s.match(/^color\(\s*srgb\s+(.*)\)$/)
  if (m) {
    const { parts, alpha } = split(m[1])
    if (parts.length !== 3) bad()
    return [...parts.map(p => clamp(num(p, 1), 1) * 255), clamp(alpha, 1)]
  }
  if (/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s)) {
    let h = s.slice(1)
    if (h.length <= 4) h = [...h].map(c => c + c).join('')
    const n = h.match(/../g).map(x => parseInt(x, 16))
    return [n[0], n[1], n[2], n[3] === undefined ? 1 : n[3] / 255]
  }
  return bad()
}

export function over(fg, bg) {
  return [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3]))
}
