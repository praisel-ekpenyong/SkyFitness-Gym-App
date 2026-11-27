import { useEffect, useId, useLayoutEffect, useRef } from 'react'
import { useUI } from '../store/useUI.js'
import { createSheetHistory } from '../platform/sheet-history.js'
import { createBrowserHistoryAdapter } from '../platform/browser-history.js'

/**
 * @param {(sheets: Array<{ id: string, locked?: boolean }>) => void} handler
 * @returns {() => void}
 */
const subscribeSheets = handler => useUI.subscribe((state, prev) => {
  if (state.sheets !== prev.sheets) handler(state.sheets)
})

// The host injects the three Adapters. The real hardware-Back handle is installed
// by a later ticket; until then only the identity-exact install contract is needed here.
export function createModalsHost() {
  return {
    sheets: {
      subscribe: subscribeSheets,
      getSheets: () => useUI.getState().sheets,
      closeSheet: (/** @type {string} */ id) => useUI.getState().closeSheet(id),
    },
    history: createBrowserHistoryAdapter(),
    back: { install: () => () => {} },
  }
}

function Sheet({ sheet, covered }) {
  const closeSheet = useUI(s => s.closeSheet)
  const ref = useRef(null)
  const centerRef = useRef(null)
  const drag = useRef({ startY: null, delta: 0 })
  const previousFocus = useRef(null)
  const titleId = useId()

  useLayoutEffect(() => {
    const dialog = ref.current || centerRef.current
    if (!dialog) return
    const heading = dialog.querySelector('h2, h3')
    if (heading) {
      if (!heading.id) heading.id = titleId
      dialog.setAttribute('aria-labelledby', heading.id)
      return
    }
    dialog.removeAttribute('aria-labelledby')
    if (sheet.label) return
    const msg = 'Sheet opened an unnamed dialog: give it an h2/h3 or pass `label` to openSheet.'
    if (import.meta.env.DEV) throw new Error(msg)
    console.error(msg)
  })

  useEffect(() => {
    previousFocus.current = typeof document !== 'undefined' ? document.activeElement : null
    const container = ref.current || centerRef.current
    if (container && typeof container.querySelectorAll === 'function') {
      const focusable = container.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length > 0 && typeof focusable[0]?.focus === 'function') {
        if (typeof document !== 'undefined' && !container.contains(document.activeElement)) {
          focusable[0].focus()
        }
      } else if (typeof container.focus === 'function') {
        container.focus()
      }
    }
    return () => {
      if (previousFocus.current && typeof previousFocus.current.focus === 'function') {
        try { previousFocus.current.focus() } catch (_) {}
      }
    }
  }, [])

  const onKeyDown = e => {
    if (e.key !== 'Tab') return
    const container = ref.current || centerRef.current
    if (!container || typeof container.querySelectorAll !== 'function') return
    const focusable = Array.from(container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ))
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first || !container.contains(document.activeElement)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last || !container.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  const onTouchStart = e => {
    const el = ref.current
    if (e.target.closest && e.target.closest('input[type=range], [data-nodrag]')) {
      drag.current = { startY: null, delta: 0 }
      return
    }
    drag.current = { startY: el.scrollTop <= 0 ? e.touches[0].clientY : null, delta: 0 }
  }
  const onTouchMove = e => {
    const el = ref.current, d = drag.current
    if (d.startY === null) return
    d.delta = e.touches[0].clientY - d.startY
    if (d.delta > 0 && el.scrollTop <= 0) {
      e.preventDefault()
      el.style.transition = 'none'
      el.style.transform = `translateY(${d.delta}px)`
    } else d.delta = 0
  }
  const onTouchEnd = () => {
    const el = ref.current, d = drag.current
    if (d.startY === null) return
    el.style.transition = 'transform .2s'
    if (d.delta > 90 && !sheet.locked) { el.style.transform = 'translateY(110%)'; setTimeout(() => closeSheet(sheet.id), 180) }
    else el.style.transform = ''
    d.startY = null
  }
  const onMouseDown = e => {
    if (e.button !== 0) return
    if (e.target.closest && e.target.closest('input[type=range], [data-nodrag]')) {
      drag.current = { startY: null, delta: 0 }
      return
    }
    const el = ref.current
    drag.current = { startY: el.scrollTop <= 0 ? e.clientY : null, delta: 0 }
  }
  const onMouseMove = e => {
    const el = ref.current, d = drag.current
    if (d.startY === null) return
    d.delta = e.clientY - d.startY
    if (d.delta > 0 && el.scrollTop <= 0) {
      e.preventDefault()
      el.style.transition = 'none'
      el.style.transform = `translateY(${d.delta}px)`
    } else d.delta = 0
  }
  const onMouseUp = () => onTouchEnd()

  // non-passive touchmove so preventDefault works (bottom sheets only; centered dialogs have no ref)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      el.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const close = () => closeSheet(sheet.id)
  const role = sheet.kind === 'center' ? 'alertdialog' : 'dialog'
  if (sheet.kind === 'full') {
    return (
      <div className="fullsheet" inert={covered} ref={centerRef} role={role} aria-modal="true" aria-label={sheet.label} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="fullsheet-in">{sheet.render(close)}</div>
      </div>
    )
  }
  if (sheet.kind === 'center') {
    return (
      <div inert={covered}>
        <div className="mback" aria-hidden="true" onClick={() => { if (!sheet.locked) close() }} />
        <div className="center" ref={centerRef} role={role} aria-modal="true" aria-label={sheet.label} tabIndex={-1} onKeyDown={onKeyDown}>
          {sheet.render(close)}
        </div>
      </div>
    )
  }
  return (
    <div inert={covered}>
      <div className="mback" aria-hidden="true" onClick={() => { if (!sheet.locked) close() }} />
      <div className="sheet" ref={ref} role={role} aria-modal="true" aria-label={sheet.label} tabIndex={-1} onKeyDown={onKeyDown}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <div className="grab" />
        {sheet.render(close)}
      </div>
    </div>
  )
}

/**
 * @param {{ host?: ReturnType<typeof createModalsHost> }} props
 */
export default function Modals({ host } = {}) {
  const sheets = useUI(s => s.sheets)
  const modalRoot = useRef(null)
  const open = sheets.length > 0

  useLayoutEffect(() => {
    if (!open || !modalRoot.current) return
    const made = new Set()
    const kept = new Map()
    const parents = []
    for (let node = modalRoot.current; node.parentElement && node !== document.body; node = node.parentElement) {
      kept.set(node.parentElement, node)
      parents.push(node.parentElement)
    }
    const shut = sibling => {
      if (kept.get(sibling.parentElement) === sibling || made.has(sibling)) return
      if (sibling.hasAttribute('inert') || sibling.hasAttribute('data-over-modals')) return
      sibling.setAttribute('inert', '')
      made.add(sibling)
    }
    for (const parent of parents) for (const sibling of parent.children) shut(sibling)
    const watch = typeof MutationObserver === 'function' && new MutationObserver(records => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && n.parentElement === r.target) shut(n)
    })
    if (watch) for (const parent of parents) watch.observe(parent, { childList: true })
    return () => {
      if (watch) watch.disconnect()
      made.forEach(el => el.removeAttribute('inert'))
    }
  }, [open])

  // One attach for the whole component: the Module owns both subscriptions and the
  // Back handle, and the disposer is idempotent on unmount.
  useEffect(() => {
    const dispose = createSheetHistory(host ?? createModalsHost())
    return dispose
  }, [host])

  useEffect(() => {
    if (!sheets.length) return
    const onKey = e => { if (e.key === 'Escape') { const top = useUI.getState().sheets[useUI.getState().sheets.length - 1]; if (top && !top.locked) useUI.getState().closeSheet(top.id) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheets.length])
  useEffect(() => {
    if (!sheets.length) return
    const y = window.scrollY || 0
    const b = document.body.style
    b.position = 'fixed'; b.top = -y + 'px'; b.left = '0'; b.right = '0'; b.width = '100%'
    return () => {
      b.position = b.top = b.left = b.right = b.width = ''
      window.scrollTo(0, y)
    }
  }, [sheets.length > 0])

  if (!sheets.length) return null
  return (
    <div id="modal-root" className="open" ref={modalRoot}>
      {sheets.map((s, i) => <Sheet key={s.id} sheet={s} covered={i < sheets.length - 1} />)}
    </div>
  )
}
