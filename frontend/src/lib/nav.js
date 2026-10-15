// Lets non-component modules (sheet flows) navigate. App registers the router's navigate.
let _nav = () => {}
/**
 * Registers the router navigate function for non-component modules to call.
 * @param {Function} fn - Navigate function accepting a destination; replaces the previous registration.
 * @returns {void} Nothing; stores the function as a side effect.
 */
export const setNav = fn => { _nav = fn }
/**
 * Navigates to a route through the registered router function.
 * @param {string} to - Destination passed straight to the registered navigate.
 * @returns {*} The registered navigate's return value; undefined before registration.
 */
export const nav = to => _nav(to)
