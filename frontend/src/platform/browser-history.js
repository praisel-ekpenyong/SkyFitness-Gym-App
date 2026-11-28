// The one browser-history edge the sheet host uses. The three globals are taken as
// parameters (defaulting to the real ones) so a caller can inject them: in tests the
// linkedom DOM installs `window`, `location` and `history` as separate objects.
export function createBrowserHistoryAdapter({
  history: h = history,
  location: loc = location,
  win = window,
} = {}) {
  return {
    href: () => loc.href,
    push: () => h.pushState({ skySheet: true }, ''),
    /** @param {number} count - number of sheet entries to walk back. */
    rewind: count => h.go(-count),
    /**
     * @param {EventListener} handler - called on each browser pop.
     * @returns {() => void} unsubscribes this handler, by identity, only.
     */
    onPop: handler => {
      win.addEventListener('popstate', handler)
      return () => win.removeEventListener('popstate', handler)
    },
  }
}
