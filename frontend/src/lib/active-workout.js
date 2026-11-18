/**
 * The Active workout interface: `act` changes it, `sessionView` reads it.
 * Everything else under lib/active-* is internal to this seam (ADR 0032).
 */
export { sessionView } from './session-view.js'
export { act } from './active-act.js'
