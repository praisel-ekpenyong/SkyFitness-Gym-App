import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { validateEnv } from './env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('env seam validates every environment-gated behavior', () => {
  it('defaults to web, local media, relative base and no analytics when nothing is set', () => {
    expect(validateEnv({})).toEqual({
      mobile: false,
      imgBase: 'media/images/',
      gifBase: 'media/videos/',
      baseUrl: './',
      umamiSrc: undefined,
      umamiId: undefined,
    })
  })

  it('enables the mobile shell only on the exact VITE_MOBILE=1 build flag', () => {
    expect(validateEnv({ VITE_MOBILE: '1' }).mobile).toBe(true)
    expect(validateEnv({ VITE_MOBILE: '0' }).mobile).toBe(false)
    expect(validateEnv({ VITE_MOBILE: 'true' }).mobile).toBe(false)
    expect(validateEnv({}).mobile).toBe(false)
  })

  it('normalizes media bases to a trailing slash and falls back on empty values', () => {
    expect(validateEnv({ VITE_IMG_BASE: 'custom/img' }).imgBase).toBe('custom/img/')
    expect(validateEnv({ VITE_IMG_BASE: 'custom/img/' }).imgBase).toBe('custom/img/')
    expect(validateEnv({ VITE_IMG_BASE: '' }).imgBase).toBe('media/images/')
    expect(validateEnv({ VITE_GIF_BASE: 'custom/vid' }).gifBase).toBe('custom/vid/')
    expect(validateEnv({ VITE_GIF_BASE: '' }).gifBase).toBe('media/videos/')
  })

  it('keeps deploy subpath scope correct via BASE_URL with a trailing slash', () => {
    expect(validateEnv({}).baseUrl).toBe('./')
    expect(validateEnv({ BASE_URL: '/' }).baseUrl).toBe('/')
    expect(validateEnv({ BASE_URL: '/sky/' }).baseUrl).toBe('/sky/')
    expect(validateEnv({ BASE_URL: '/sky' }).baseUrl).toBe('/sky/')
  })

  it('enables analytics only when both Umami vars are set, trimmed', () => {
    expect(validateEnv({
      VITE_UMAMI_SRC: 'https://stats.example/script.js',
      VITE_UMAMI_ID: '  abc-123  ',
    })).toMatchObject({
      umamiSrc: 'https://stats.example/script.js',
      umamiId: 'abc-123',
    })
    // Half-configured analytics stays disabled, never half-injected.
    expect(validateEnv({ VITE_UMAMI_SRC: 'https://stats.example/script.js' })).toMatchObject({
      umamiSrc: undefined,
      umamiId: undefined,
    })
    expect(validateEnv({ VITE_UMAMI_ID: 'abc-123' })).toMatchObject({
      umamiSrc: undefined,
      umamiId: undefined,
    })
  })

  it('is documented by a tracked example covering every variable', () => {
    const examplePath = resolve(__dirname, '..', '..', '.env.example')
    expect(existsSync(examplePath)).toBe(true)
    const content = readFileSync(examplePath, 'utf-8')
    for (const key of ['VITE_MOBILE', 'VITE_IMG_BASE', 'VITE_GIF_BASE', 'VITE_UMAMI_SRC', 'VITE_UMAMI_ID', 'BASE_URL']) {
      expect(content).toContain(key)
    }
  })
})
