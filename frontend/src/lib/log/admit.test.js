import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { admit, toDisk } from './admit.js'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..')

function sourceFiles() {
  const out = []
  const walk = dir => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(js|jsx)$/.test(p) && !/\.test\.(js|jsx)$/.test(p)) out.push(p)
    }
  }
  walk(SRC)
  return out
}

describe('admit', () => {
  it('maps a legacy showRir flag onto effort and drops the flag', () => {
    const raw = { showRir: true, unit: 'lb', topW: { a: 100 }, asked: true, workouts: [{ id: 'w1' }] }
    const sealed = admit(raw)
    expect(sealed.effort).toBe('rir')
    expect(sealed.showRir).toBeUndefined()
    expect(sealed.unit).toBe('lb')
    expect(sealed.topW).toEqual({ a: 100 })
    expect(sealed.asked).toBe(true)
    expect(sealed.workouts).toEqual([{ id: 'w1' }])
    expect(raw.showRir).toBe(true)
  })

  it('keeps a real effort value ahead of the legacy flag', () => {
    expect(admit({ showRir: true, effort: 'rpe' }).effort).toBe('rpe')
    expect(admit({ showRir: true, effort: 'none' }).effort).toBe('none')
    expect(admit({ showRir: false }).effort).toBe('none')
    expect(admit({ effort: 'nope', showRir: true }).effort).toBe('rir')
    expect(admit({}).effort).toBe('none')
  })

  it('seals the same profile when a load overlay has already written a null effort', () => {
    const overlay = stored => ({ unit: 'kg', effort: null, ...stored })
    expect(admit(overlay({ showRir: true })).effort).toBe('rir')
    expect(admit(overlay({ showRir: true, effort: undefined })).effort).toBe('rir')
    expect(admit(overlay({ showRir: false })).effort).toBe('none')
  })

  it('round-trips through disk without writing showRir', () => {
    const raw = { showRir: true, unit: 'kg', workouts: [] }
    const once = admit(raw)
    const disk = toDisk(once)
    expect(disk.showRir).toBeUndefined()
    expect(disk.effort).toBe('rir')
    expect(admit(disk)).toEqual(once)
    expect(admit(toDisk(admit(raw)))).toEqual(once)
  })

  it('is the only domain file that reads showRir', () => {
    const hits = sourceFiles()
      .filter(p => readFileSync(p, 'utf8').includes('showRir'))
      .map(p => relative(SRC, p))
    expect(hits).toEqual(['lib/log/admit.js'])
  })

  it('is imported only by the load path', () => {
    const hits = sourceFiles()
      .filter(p => !p.endsWith('/lib/log/admit.js') && readFileSync(p, 'utf8').includes('log/admit'))
      .map(p => relative(SRC, p))
    expect(hits).toEqual(['store/useStore.js'])
  })
})
