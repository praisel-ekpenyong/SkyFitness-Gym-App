
import { Fragment, useRef, useState, useEffect, useCallback, forwardRef } from 'react'
import Icon from './Icon.jsx'
import { t } from '../lib/i18n.js'
import { useUI } from '../store/useUI.js'


export const dotted = items => items.filter(Boolean).map((x, i) => <Fragment key={i}>{i > 0 && ' · '}{x}</Fragment>)


// iOS decimal keypads in many locales only offer a comma, and type="number" reports "" for it (value snaps to 0).
export function NumberField({ value, onChange, onBlur, decimal = true, nullable = false, className = '', ...rest }) {
  // The draft remembers the number it sent, so a value changed from outside drops it.
  const [draft, setDraft] = useState(null)
  if (draft !== null && draft.n !== (value ?? null)) setDraft(null)
  const commit = raw => {
    let s = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
    const i = s.indexOf('.')
    if (i !== -1) s = decimal ? s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '') : s.slice(0, i)
    const n = s === '' || s === '.' ? (nullable ? null : 0) : Math.max(0, parseFloat(s))
    setDraft({ text: s, n })
    onChange(n)
  }
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      className={'num ' + className}
      value={draft?.text ?? (value ?? '')}
      onFocus={e => e.target.select()}
      onChange={e => commit(e.target.value)}
      onBlur={e => { setDraft(null); onBlur?.(e) }}
      {...rest}
    />
  )
}

export const TextField = forwardRef(function TextField({ className = '', ...rest }, ref) {
  return <input ref={ref} className={'field ' + className} {...rest} />
})

export function TextArea({ className = '', ...rest }) {
  return <textarea className={'field area ' + className} {...rest} />
}

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

export function Switch({ checked, onChange, disabled, label, 'aria-label': ariaLabel, ...rest }) {
  const name = ariaLabel || label
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
          className={(o.value === value ? 'on' : '') + (o.sub ? ' has-sub' : '')}
          aria-label={o.ariaLabel}
          onClick={() => onChange(o.value)}
          onKeyDown={onKey}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label && <span>{o.label}</span>}
          {o.sub && <span className="seg-sub">{o.sub}</span>}
        </button>
      ))}
    </div>
  )
}

export function Stepper({ value, step = 1, onChange, decimal = true, className = '', label, unit, 'aria-label': ariaLabel }) {
  const set = v => onChange(Math.max(0, Math.round((v || 0) * 100) / 100))
  const decLabel = ariaLabel ? t('Decrease {0}', ariaLabel) : t('Decrease')
  const incLabel = ariaLabel ? t('Increase {0}', ariaLabel) : t('Increase')
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


export function Section({ title, footer, children, className = '' }) {
  return (
    <section className={'sect ' + className}>
      {title && <h2 className="sect-t">{title}</h2>}
      <div className="sect-b">{children}</div>
      {footer && <p className="sect-f">{footer}</p>}
    </section>
  )
}

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


export function SelectRow({ icon, title, value, options, onChange, sheetTitle }) {
  const cur = options.find(o => o.value === value)
  const open = () => {
    const { openSheet } = useUI.getState()
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
