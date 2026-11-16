
function withSlash(value, fallback) {
  const s = String(value ?? '').trim()
  if (!s) return fallback
  return s.replace(/\/?$/, '/')
}

function nonEmpty(value) {
  const s = String(value ?? '').trim()
  return s ? s : undefined
}

/**
 * Normalizes one raw environment object into the validated settings every reader shares.
 * @param {Object} raw - Raw key-value map from the build and process environment; defaults to empty.
 * @returns {Object} Validated mobile, media-base, base-URL, dev seed-plan and analytics fields with defaults applied; analytics stays undefined unless both halves are set.
 */
export function validateEnv(raw = {}) {
  const mobile = raw.VITE_MOBILE === '1'
  const imgBase = withSlash(raw.VITE_IMG_BASE, 'media/images/')
  const gifBase = withSlash(raw.VITE_GIF_BASE, 'media/videos/')
  const baseUrl = withSlash(raw.BASE_URL, './')
  const seedPlan = raw.PROD === true || raw.PROD === 'true' ? undefined : nonEmpty(raw.VITE_SEED_PLAN)
  const umamiSrc = nonEmpty(raw.VITE_UMAMI_SRC)
  const umamiId = nonEmpty(raw.VITE_UMAMI_ID)
  return {
    mobile,
    imgBase,
    gifBase,
    baseUrl,
    seedPlan,
    umamiSrc: umamiSrc && umamiId ? umamiSrc : undefined,
    umamiId: umamiSrc && umamiId ? umamiId : undefined,
  }
}

function readRawEnv() {
  const meta = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
  const proc = (typeof process !== 'undefined' && process.env) ? process.env : {}
  return { ...proc, ...meta }
}

export const env = validateEnv(readRawEnv())

export const MOBILE = env.mobile
export const IMG_BASE = env.imgBase
export const GIF_BASE = env.gifBase
export const BASE_URL = env.baseUrl
export const SEED_PLAN = env.seedPlan
export const UMAMI_SRC = env.umamiSrc
export const UMAMI_ID = env.umamiId
