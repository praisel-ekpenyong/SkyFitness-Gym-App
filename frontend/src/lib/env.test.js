import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateEnv } from './env.js'

describe('env seam validates every environment-gated behavior', () => {
  it('defaults to web, local media, relative base when nothing is set', () => {
    expect(validateEnv({})).toEqual({
      mobile: false,
      imgBase: 'media/images/',
      gifBase: 'media/videos/',
      baseUrl: './',
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

  it('is documented by a tracked example covering every variable', () => {
    const examplePath = resolve(import.meta.dirname, '..', '..', '.env.example')
    expect(existsSync(examplePath)).toBe(true)
    const content = readFileSync(examplePath, 'utf-8')
    for (const key of ['VITE_MOBILE', 'VITE_IMG_BASE', 'VITE_GIF_BASE', 'BASE_URL']) {
      expect(content).toContain(key)
    }
  })
})
