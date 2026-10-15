// Validated environment seam — the single home for every environment-gated behavior.
//
// Previously each consumer read import.meta.env (or process.env in vite.config.js)
// with its own inline fallback, so a new variable meant hunting every reader and a
// mistyped value failed far from its source. All readers now go through here:
// validateEnv() normalizes one raw object once at startup, and the exported
// singleton carries the validated result. Behavior is unchanged — defaults match
// the fallbacks the scattered reads used.
//
// Variables (documented in frontend/.env.example):
// - VITE_MOBILE: '1' for the Capacitor app-store shell, anything else is web.
// - VITE_IMG_BASE / VITE_GIF_BASE: media overrides for self-hosted installs.
// - VITE_UMAMI_SRC / VITE_UMAMI_ID: analytics, injected only when both are set.
// - BASE_URL: Vite-provided deploy scope (subpath installs), default './'.

/**
 * Normalizes a base path onto the trailing-slash form media and routing reads.
 * @param {*} value - Raw configured value; blank or missing yields the fallback.
 * @param {string} fallback - Default returned when the value is empty.
 * @returns {string} Trimmed value ending in `/`, or the fallback.
 */
function withSlash(value, fallback) {
  const s = String(value ?? '').trim()
  if (!s) return fallback
  return s.replace(/\/?$/, '/')
}

/**
 * Trims a configured value down to a present-or-absent signal.
 * @param {*} value - Raw configured value of any type.
 * @returns {string|undefined} Trimmed non-empty string, or undefined when blank or missing.
 */
function nonEmpty(value) {
  const s = String(value ?? '').trim()
  return s ? s : undefined
}

/**
 * Normalizes one raw environment object into the validated settings every reader shares.
 * @param {Object} raw - Raw key-value map from the build and process environment; defaults to empty.
 * @returns {Object} Validated mobile, media-base, base-URL, and analytics fields with defaults applied; analytics stays undefined unless both halves are set.
 */
export function validateEnv(raw = {}) {
  const mobile = raw.VITE_MOBILE === '1'
  const imgBase = withSlash(raw.VITE_IMG_BASE, 'media/images/')
  const gifBase = withSlash(raw.VITE_GIF_BASE, 'media/videos/')
  const baseUrl = withSlash(raw.BASE_URL, './')
  const umamiSrc = nonEmpty(raw.VITE_UMAMI_SRC)
  const umamiId = nonEmpty(raw.VITE_UMAMI_ID)
  return {
    mobile,
    imgBase,
    gifBase,
    baseUrl,
    // Half-configured analytics stays disabled rather than half-injected.
    umamiSrc: umamiSrc && umamiId ? umamiSrc : undefined,
    umamiId: umamiSrc && umamiId ? umamiId : undefined,
  }
}

/**
 * Reads the raw environment from the current runtime for one-time startup validation.
 * @returns {Object} Merged process and build-time variables with build-time values winning; empty when neither source exists.
 */
function readRawEnv() {
  const meta = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
  const proc = (typeof process !== 'undefined' && process.env) ? process.env : {}
  return { ...proc, ...meta }
}

// Validated once at startup; every consumer reads this instead of env sources.
export const env = validateEnv(readRawEnv())

export const MOBILE = env.mobile
export const IMG_BASE = env.imgBase
export const GIF_BASE = env.gifBase
export const BASE_URL = env.baseUrl
export const UMAMI_SRC = env.umamiSrc
export const UMAMI_ID = env.umamiId
