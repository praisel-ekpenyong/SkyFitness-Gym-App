import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

/** Reads the Profile at call time, for sheet event handlers outside render. */
export const S = () => useStore.getState().S

/** @param {...*} a - The arguments to the store's `update`. */
export const update = (...a) => useStore.getState().update(...a)

/** Reads the UI store at call time. */
export const ui = () => useUI.getState()

/** @param {string} m - The message to show. */
export const toast = m => ui().toast(m)
