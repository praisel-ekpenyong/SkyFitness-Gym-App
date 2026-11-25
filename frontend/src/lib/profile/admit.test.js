import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { admit } from './index.js'

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
  it('throws on a non-record payload instead of returning it unchanged', () => {
    for (const raw of [null, 'x', 5, []]) {
      expect(() => admit(raw), `admit(${JSON.stringify(raw)})`).toThrow(Error)
    }
  })

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

  it('upgrades a legacy warm-up flag to the phase shape without touching values', () => {
    const raw = {
      unit: 'lb',
      topW: { '0025': { w: 100 } },
      asked: true,
      workouts: [{
        id: 'w1', d: '2026-01-02', start: 2,
        entries: [{
          id: '0025', topW: 100, asked: true,
          sets: [
            { warmup: true, w: 40, r: 5, done: true, topW: 55, asked: true },
            { w: 60, r: 5, done: true },
          ],
        }],
      }],
    }
    const out = admit(raw)
    expect(out.workouts[0].entries[0].sets).toEqual([
      { w: 40, r: 5, done: true, topW: 55, asked: true, phase: 'warmup' },
      { w: 60, r: 5, done: true },
    ])
    expect(out.unit).toBe('lb')
    expect(out.topW).toEqual({ '0025': { w: 100 } })
    expect(out.asked).toBe(true)
    expect(out.workouts[0].entries[0].topW).toBe(100)
    expect(out.workouts[0].entries[0].asked).toBe(true)
    expect(raw.workouts[0].entries[0].sets[0]).toEqual({ warmup: true, w: 40, r: 5, done: true, topW: 55, asked: true })
  })

  it('keeps an explicit phase authoritative and still drops the legacy flag', () => {
    const out = admit({ workouts: [{ d: '2026-01-01', start: 1, entries: [{ id: 'e', sets: [{ phase: 'work', warmup: true, w: 60 }] }] }] })
    expect(out.workouts[0].entries[0].sets[0]).toEqual({ phase: 'work', w: 60 })
  })

  it('upgrades the Active workout too', () => {
    const out = admit({ active: { id: 'a1', d: '2026-01-01', entries: [{ id: 'e', sets: [{ warmup: true, w: 20 }] }] } })
    const set = out.active.entries[0].sets[0]
    expect(set.phase).toBe('warmup')
    expect(set.w).toBe(20)
    expect(set.id).toEqual(expect.any(String))
    expect(admit(out).active.entries[0].sets[0]).toEqual(set)
  })

  it('stamps missing ids on the Active session and Routine rows, and leaves finished Workouts as stored', () => {
    const raw = {
      active: { id: 'a1', entries: [{ id: 'e', sets: [{ w: 40, r: 5, done: false }, { id: 'keep', w: 50, r: 5, done: false }] }] },
      routines: [{ id: 'r1', ex: [{ id: '0025', sets: 3 }, { id: '0026', sets: 2, rowId: 'row-keep' }] }],
      workouts: [{ id: 'w1', d: '2026-01-02', start: 2, entries: [{ id: 'e', sets: [{ w: 60, r: 5, done: true }] }] }],
    }
    const out = admit(raw)
    expect(out.active.entries[0].sets[0].w).toBe(40)
    expect(out.active.entries[0].sets[0].id).toEqual(expect.any(String))
    expect(out.active.entries[0].sets[1]).toEqual({ id: 'keep', w: 50, r: 5, done: false })
    expect(out.routines[0].ex[0].sets).toBe(3)
    expect(out.routines[0].ex[0].rowId).toEqual(expect.any(String))
    expect(out.routines[0].ex[1].rowId).toBe('row-keep')
    expect(out.workouts[0].entries[0].sets).toEqual([{ w: 60, r: 5, done: true }])
    const again = admit(out)
    expect(again.active.entries[0].sets[0].id).toBe(out.active.entries[0].sets[0].id)
    expect(again.routines[0].ex[0].rowId).toBe(out.routines[0].ex[0].rowId)
    expect(raw.active.entries[0].sets[0]).toEqual({ w: 40, r: 5, done: false })
    expect(raw.routines[0].ex[0]).toEqual({ id: '0025', sets: 3 })
  })

  it('is idempotent', () => {
    const raw = {
      showRir: true, unit: 'kg', workouts: [{
        d: '2026-01-02', start: 2,
        entries: [{ id: 'e', sets: [{ warmup: true, w: 40, r: 5, done: true }] }],
      }],
    }
    const once = admit(raw)
    expect(admit(once)).toEqual(once)
    expect(admit(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })

  it('leaves showRir to the 0 → 1 upgrade step alone; restore keys only carry it there', () => {
    const hits = sourceFiles()
      .filter(p => readFileSync(p, 'utf8').includes('showRir'))
      .map(p => relative(SRC, p))
    expect(hits.sort()).toEqual(['lib/profile/restore-keys.js', 'lib/profile/upgrades.js'])
  })
})
