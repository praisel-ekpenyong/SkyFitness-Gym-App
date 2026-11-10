// The pinned exercise-dataset release that exercise art streams from. No imports, so the build
// config can read it too (vite.config.js points builds without bundled media straight here).
// public/sw.js matches the same CDN path to cache the art; public/_headers allows the host.
export const PINNED_DATASET_COMMIT = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd'
export const CDN_IMG_BASE = `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${PINNED_DATASET_COMMIT}/images/`
export const CDN_GIF_BASE = `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${PINNED_DATASET_COMMIT}/videos/`
