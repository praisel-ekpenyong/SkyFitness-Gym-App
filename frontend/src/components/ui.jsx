// Sky control set.
//
// Every input in the app is built here rather than styled on top of a native
// widget. Native controls are the single loudest "unfinished" tell: a checkbox
// renders blue on iOS and grey on Android, a range slider paints its own white
// track that no theme reaches, and a <select> opens a system list that ignores
// dark mode entirely. Rebuilding them means one visual language and one focus
// treatment across every platform.
//
// Shared rules:
//   · every control is driven by (value, onChange) — no internal source of truth
//   · hit targets are ≥44px even when the painted control is smaller
//   · :active gives a scale/tint response so touch feels acknowledged
//   · focus-visible draws a ring; pointer interaction never does

import { useRef, useState, useEffect, useCallback, forwardRef } from 'react'
import Icon from './Icon.jsx'

/* ============================ text ============================ */

// Numeric input accepting "," as decimal separator — iOS decimal keypads in many
// locales only offer a comma, and type="number" reports "" for it (value snaps to
// 0). Keeps a local string draft while focused so partial input like "33," survives.
// `nullable` is for fields where "nothing entered" and 0 mean different things (RIR: a
// logged 0 is a set taken to failure). Those clear back to null instead of snapping to 0.
export function NumberField({ value, onChange, decimal = true, nullable = false, className = '', ...rest }) {
  const [draft, setDraft] = useState(null)
  const committed = useRef(null)
  // null and undefined are the same "empty" here — a nullable field's key is dropped once cleared.
  if (draft !== null && (committed.current ?? null) !== (value ?? null)) { setDraft(null); committed.current = null }
  const commit = raw => {
    let s = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const i = s.indexOf('.')
    if (i !== -1) s = decimal ? s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '') : s.slice(0, i)
    const n = s === '' || s === '.' ? (nullable ? null : 0) : Math.max(0, parseFloat(s))
    committed.current = n
    setDraft(s)
    onChange(n)
  }
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={'num ' + className}
      value={draft ?? (value ?? '')}
      onFocus={e => e.target.select()}
      onChange={e => commit(e.target.value)}
      onBlur={() => { setDraft(null); committed.current = null }}
      {...rest}
    />
  )
}

// forwardRef so callers can focus it or read its value imperatively
export const TextField = forwardRef(function TextField({ className = '', ...rest }, ref) {
  return <input ref={ref} className={'field ' + className} {...rest} />
})

/**
 * Multi-line text field in the shared field styling; use for free-form notes.
 * Remaining props pass through to the underlying textarea.
 * @param {string} [className] - Extra classes appended to the field styling.
 */
export function TextArea({ className = '', ...rest }) {
  return <textarea className={'field area ' + className} {...rest} />
}

/**
 * Search input with a magnifier and a clear button shown while there is text; use for filtering lists.
 * The input's accessible name falls back to the placeholder, then to "Search".
 * @param {string} value - Current query text.
 * @param {Function} onChange - Called with the input change event.
 * @param {Function} onClear - Called when the clear button is pressed.
 */
export function SearchField({ value, onChange, onClear, className = '', style, 'aria-label': ariaLabel, ...rest }) {
  const label = ariaLabel || rest.placeholder || 'Search'
  return (
    <div className={'search searchf ' + className} style={style}>
      <Icon name="magnifier" className="lead" />
      <input className="field input" value={value} onChange={onChange} aria-label={label} {...rest} />
      {!!value && (
        <button type="button" className="clear" onClick={onClear} aria-label="Clear">
          <Icon name="xmark" />
        </button>
      )}
    </div>
  )
}

/**
 * Toggle switch (role="switch") with an enlarged touch target; use for on/off settings.
 * A visible label or an aria-label must be provided, otherwise it throws instead of rendering a nameless switch.
 * @param {boolean} checked - Whether the switch is on.
 * @param {Function} onChange - Called with the toggled value.
 * @param {boolean} [disabled] - Whether the switch is disabled.
 * @param {string} [label] - Visible label text, also used as the accessible name.
 */
export function Switch({ checked, onChange, disabled, label, 'aria-label': ariaLabel, ...rest }) {
  const name = ariaLabel || label
  // The visible label text is the accessible name. Rendering without either would
  // put aria-label={undefined} on the button — a bare switch for screen readers —
  // so fail loudly instead of shipping the regression silently.
  if (!name) throw new Error('Switch requires `label` or `aria-label` so it never renders as a bare switch.')
  return (
    <span className="sw-hit">
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        aria-label={name}
        disabled={disabled}
        className={'sw' + (checked ? ' on' : '')}
        onClick={() => onChange(!checked)}
        {...rest}
      >
        <span className="knob" />
      </button>
    </span>
  )
}

/* ============================ segmented ============================ */

// options: [{ value, label, icon? }]  — the selected pill slides between cells.
// Single-select: announced as a radiogroup with radio options (not toggle
// buttons), so assistive tech reads the choice as one group. Roving tabindex
// keeps one stop per group; arrows move between options.
export function Segmented({ options, value, onChange, className = '', label, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledby }) {
  const i = Math.max(0, options.findIndex(o => o.value === value))
  const name = ariaLabel || label
  const move = (currentTarget, dir) => {
    const next = (i + dir + options.length) % options.length
    onChange(options[next].value)
    const radios = currentTarget.parentElement?.querySelectorAll('[role="radio"]')
    radios?.[next]?.focus()
  }
  const onKey = e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return
    e.preventDefault()
    move(e.currentTarget, (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1)
  }
  return (
    <div className={'seg ' + className} style={{ '--n': options.length, '--i': i }}
      role="radiogroup" aria-label={name} aria-labelledby={ariaLabelledby}>
      <span className="seg-sel" aria-hidden="true" />
      {options.map((o, idx) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={idx === i ? 0 : -1}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
          onKeyDown={onKey}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  )
}

/**
 * Minus/plus stepper around an editable numeric field; use for quantities like weight or reps.
 * Values are clamped at zero; the decrease/increase buttons are named from the field label.
 * @param {number} value - Current numeric value.
 * @param {number} [step] - Amount each button press adds or subtracts.
 * @param {Function} onChange - Called with the new value.
 * @param {boolean} [decimal] - Whether the inner field accepts decimals.
 * @param {string} [label] - Optional heading rendered above the stepper.
 * @param {string} [unit] - Optional unit suffix shown after the field.
 */
export function Stepper({ value, step = 1, onChange, decimal = true, className = '', label, unit, 'aria-label': ariaLabel }) {
  const set = v => onChange(Math.max(0, Math.round((v || 0) * 100) / 100))
  const decLabel = ariaLabel ? `Decrease ${ariaLabel}` : 'Decrease'
  const incLabel = ariaLabel ? `Increase ${ariaLabel}` : 'Increase'
  const inner = (
    <div className={'stp ' + className}>
      <button type="button" onClick={() => set((+value || 0) - step)} aria-label={decLabel}><Icon name="minus" /></button>
      <span className="val">
        <NumberField value={value} decimal={decimal} onChange={onChange} aria-label={ariaLabel || label} />
        {unit && <i>{unit}</i>}
      </span>
      <button type="button" onClick={() => set((+value || 0) + step)} aria-label={incLabel}><Icon name="plus" /></button>
    </div>
  )
  if (!label) return inner
  return <div className="stp-w"><span className="stp-l">{label}</span>{inner}</div>
}

/* ============================ slider ============================ */

// Pointer-driven so the fill, track and thumb are all ours — no ::-webkit-*
// pseudo-elements, which is the only way the control looks identical on every
// platform and can pick up the accent colour.
export function Slider({ value, min = 0, max = 100, step = 1, onChange, className = '', ...rest }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(false)
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))

  const posToValue = useCallback(clientX => {
    const el = ref.current
    if (!el) return value
    const r = el.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const raw = min + f * (max - min)
    const snapped = Math.round(raw / step) * step
    // step can be fractional (0.1) — round away binary noise
    return Math.min(max, Math.max(min, Math.round(snapped * 1000) / 1000))
  }, [min, max, step, value])

  useEffect(() => {
    if (!drag) return
    const move = e => {
      e.preventDefault()
      onChange(posToValue(e.touches ? e.touches[0].clientX : e.clientX))
    }
    const up = () => setDrag(false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [drag, onChange, posToValue])

  const key = e => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0
    if (!d) return
    e.preventDefault()
    onChange(Math.min(max, Math.max(min, Math.round((value + d) * 1000) / 1000)))
  }

  return (
    <div
      ref={ref}
      className={'sld' + (drag ? ' dragging' : '') + ' ' + className}
      role="slider"
      tabIndex={0}
      aria-label={rest['aria-label'] || 'Slider'}
      aria-valuenow={value} aria-valuemin={min} aria-valuemax={max}
      data-nodrag                                  /* keeps the sheet from swipe-dismissing */
      onKeyDown={key}
      onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); setDrag(true); onChange(posToValue(e.clientX)) }}
      {...rest}
    >
      <span className="sld-track"><span className="sld-fill" style={{ width: pct + '%' }} /></span>
      <span className="sld-knob" style={{ left: pct + '%' }} />
    </div>
  )
}

/**
 * Round completion checkbox (role="checkbox"); use to mark a set done.
 * Announced as "Complete set" unless an accessible name is passed.
 * @param {boolean} checked - Whether the box is ticked.
 * @param {Function} onChange - Called with the toggled value.
 * @param {number|string} [size] - Optional width/height override for the box.
 * @param {*} [children] - Optional visible label beside the tick, for the big "Log set" key.
 */
export function Check({ checked, onChange, className = '', size, children, 'aria-label': ariaLabel, ...rest }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!checked}
      aria-label={ariaLabel || rest['aria-label'] || 'Complete set'}
      className={'chk' + (checked ? ' on' : '') + ' ' + className}
      style={size ? { width: size, height: size } : null}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <Icon name="check" />
      {children}
    </button>
  )
}

/* ============================ grouped list ============================ */

// The inset-grouped list is the app's main structural primitive: a titled
// section holding rows separated by hairlines that stop short of the leading
// edge, so the icon column reads as a continuous rail.
export function Section({ title, footer, children, className = '' }) {
  return (
    <section className={'sect ' + className}>
      {title && <h2 className="sect-t">{title}</h2>}
      <div className="sect-b">{children}</div>
      {footer && <p className="sect-f">{footer}</p>}
    </section>
  )
}

/**
 * One inset-list row with optional icon, text, value and trailing accessory; use inside Section lists.
 * Renders as a button when pressable, otherwise as a static row.
 * @param {string} [icon] - Icon name for the leading column.
 * @param {string} [title] - Primary row text.
 * @param {string} [subtitle] - Secondary text under the title.
 * @param {*} [value] - Trailing value shown before the accessory.
 * @param {string} [accessory] - Trailing marker: "chevron", "check", or "none".
 * @param {Function} [onClick] - Makes the row pressable when provided.
 * @param {boolean} [danger] - Whether to tint the row destructive red.
 */
export function Row({ icon, title, subtitle, value, accessory = 'none', onClick, danger, children, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} className={'lrow' + (onClick ? ' tap' : '') + (danger ? ' danger' : '') + ' ' + className} onClick={onClick}>
      {icon && <span className="lrow-i"><Icon name={icon} /></span>}
      <span className="lrow-m">
        <span className="lrow-t">{title}</span>
        {subtitle && <span className="lrow-s">{subtitle}</span>}
      </span>
      {children}
      {value != null && <span className="lrow-v">{value}</span>}
      {accessory === 'chevron' && <Icon name="chevronRight" className="lrow-c" />}
      {accessory === 'check' && <Icon name="check" className="lrow-k" />}
    </Tag>
  )
}

/* ============================ picker ============================ */

// Replaces <select>. A native select opens a system list that ignores the app's
// theme entirely — on dark mode it flashes a white sheet — and can't show more
// than a bare label per option. This opens our own sheet with a checkmark on the
// current value, which is also how iOS itself handles a long option list.
export function SelectRow({ icon, title, value, options, onChange, sheetTitle }) {
  const cur = options.find(o => o.value === value)
  const open = () => {
    const { openSheet } = require_ui()
    const h = openSheet(close => (
      <>
        <h3>{sheetTitle || title}</h3>
        <div className="sect-b">
          {options.map(o => (
            <button key={o.value} className="lrow tap" onClick={() => { close(); onChange(o.value) }}>
              <span className="lrow-m"><span className="lrow-t">{o.label}</span>
                {o.subtitle && <span className="lrow-s">{o.subtitle}</span>}</span>
              {o.value === value && <Icon name="check" className="lrow-k" />}
            </button>
          ))}
        </div>
        <div className="gap8" />
      </>
    ))
    return h
  }
  return (
    <Row icon={icon} title={title} value={cur ? cur.label : value} accessory="chevron" onClick={open} />
  )
}

// Late import keeps this module free of a cycle at load time (useUI pulls in the
// store, which pulls in helpers that import controls).
let _ui = null
/**
 * Registers the UI store module so shared controls can open sheets without importing it at load time; call once at boot.
 * @param {Function} store - The UI store hook whose state exposes the sheet controls.
 */
export function bindUI(store) { _ui = store }
/**
 * Returns the bound UI store state; throws when bindUI has not run yet.
 * @returns {Object} The current UI store state.
 */
function require_ui() {
  if (!_ui) throw new Error('ui store not bound — call bindUI(useUI) once at boot')
  return _ui.getState()
}

/**
 * Themed button with optional leading/trailing icons; use for all tappable actions.
 * @param {string} [variant] - Visual style ("plain", "primary", "go", "live", "ghost", "danger").
 * @param {string} [size] - Size modifier (e.g. "sm").
 * @param {string} [icon] - Leading icon name.
 * @param {string} [trailingIcon] - Trailing icon name.
 * @param {*} [children] - Button label content.
 * @param {string} [className] - Extra classes appended to the button styling.
 */
export function Button({ variant = 'plain', size, icon, trailingIcon, children, className = '', ...rest }) {
  return (
    <button type="button" className={`btn ${variant}${size ? ' ' + size : ''} ${className}`} {...rest}>
      {icon && <Icon name={icon} />}
      {children && <span>{children}</span>}
      {trailingIcon && <Icon name={trailingIcon} />}
    </button>
  )
}
