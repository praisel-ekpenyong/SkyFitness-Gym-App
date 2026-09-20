# DESIGN.md — Sky

The incumbent visual system, extracted from `frontend/src/index.css` and the
views it styles. Product truth (audience, constraints, voice) lives in
[PRODUCT.md](PRODUCT.md); domain vocabulary lives in [CONTEXT.md](CONTEXT.md).

Sky did not start from a blank page: `index.css` was rebuilt around four
explicit rules, each aimed at a specific "generated" tell. Any new design work
must keep obeying them.

## Design principles (the four rules)

1. **One type scale, mostly regular weight.** Weight carries meaning — 600 for
   a title, 400 for its content — and size does the rest. Never set 700/800 on
   nearly every element; when everything shouts, position is the only cue left.
   Type classes: `.t-large` (34) → `.t-cap` (12), all with iOS-negative
   tracking and `1.29`-ish line heights.
2. **A neutral surface ramp.** Cards are near-neutral greys a few points apart
   (`--surface #1c1c1e → #2c2c2e → #3a3a3c`, light equivalents). Colour is
   spent only on the accent and on status. No saturated blue-grey surfaces.
3. **Hairlines, not borders.** Separators are sub-pixel (`--hair: .5px`) and
   inset past the icon rail, so a list reads as one object instead of a stack
   of outlined boxes. Exceptions are meaningful: `.tile`, `.home-hero`, and
   `.muscle-inspector` carry a hairline *outline* or accent edge as emphasis.
4. **Motion that acknowledges, not animates.** Presses scale ~2–8%
   (`.btn:active` .975, `.iconbtn:active` .92), transitions run 140–220 ms on
   `--ease: cubic-bezier(.32,.72,0,1)`. Nothing bounces or slides for
   decoration. `prefers-reduced-motion` disables all of it.

## Tokens (`:root`)

- **Surfaces:** `--bg` (pure black dark / `#f2f2f7` light), `--bg-el` (sheets,
  bars), `--surface`, `--surface-2` (pressed/nested), `--surface-3` (controls).
- **Labels:** `--label` plus a 4-step alpha ramp: `--label-2` (.68 dark / .72 light for WCAG AA ≥ 5.2:1 contrast) / `-3` (.32) /
  `-4` (.18) — never invent ad-hoc grey text; pick a ramp step. Status contrast tokens include `--on-orange` (`#000000`). No gray-on-colour.
- **Lines:** `--sep` / `--sep-op` at `--hair: .5px`.
- **Palette:** Apple's system colours (`--blue --green --red --orange --yellow
  --teal --indigo --pink --purple --mint --brown --grey`), so a recolour never
  looks off-system. No purple-to-blue gradients, no new hues.
- **Accent:** user-selectable via `data-accent` (8 choices, default lime/green);
  drives `--acc`, `--acc-2`, `--acc-soft` (16% mix), `--acc-line` (38% mix).
  `--on-acc` is picked **per accent by measured contrast**, not taste — light
  green/teal get black text, blue/violet/pink/red keep white. Any new accent
  use must re-verify contrast (AA 3:1 for 17px/600 button text).
- **Geometry:** radii `--r-sm 8 / --r 12 / --r-card 14 / --r-lg 16 / --r-xl 22`,
  `--pad: 16px`, `--icon-stroke: 1.7`.
- **Motion:** `--fast 140ms`, `--med 220ms`, shared `--ease`. Dynamic bars and toggles
  use compositor-accelerated GPU transforms (`transform: scaleX`) rather than layout-thrashing width transitions.
- **Mobile:** `--tap-target: 44px` on every interactive control; safe-area vars
  (`--sab/sat/sal/sar`) and fixed-UI clearances (`--page-clearance`,
  `--timer-clearance`) keep content scrollable past fixed bars.
- **Numerals:** body sets `font-variant-numeric: tabular-nums` — weights, reps,
  rest clocks always align.

## Component vocabulary

| Part | Where | Notes |
|---|---|---|
| Large-title header | `.hdr` + `h1` (34px) | with `.sub` under it |
| Grouped list | `.sect` / `.sect-t` / `.sect-b` / `.lrow` | inset hairlines start at `left:14px` (55px past an icon rail) |
| Card | `.card` | plain surface fill, no border |
| Stat tile | `.tiles` / `.tile` | hairline outline, 26px value |
| Buttons | `.btn` (+ `.primary` `.tinted` `.danger` `.ghost` `.sm` `.xs`) | min-height tap-target; filled accent only for primary |
| Icon button | `.iconbtn` | 44px circular surface |
| Tab bar | `#tabbar` | blurred `--bg-el`, center start button (accent disc, orange while recording) |
| Chips | `.chips` / `.chip(.on)` | pill filters, accent fill when on |
| Tag | `.tag(.acc)` | small rounded label, capitalize |
| Fields | `.field` / `.input` / `.searchf` | focus = inset 2px accent ring, no outline |
| Switch / segmented / stepper / slider | `.sw` `.seg` `.stp` `.sld` | iOS-dialect controls |
| Set checkbox | `.chk` / `.ck` | 40px circle, accent when done |
| Sheets | `.sheet` / `.center` + `Modals.jsx` | bottom sheets, grab handle, `.sheet h3` 20px |
| Rest/work timer | `#timer(.rest/.working)` | 97%-opaque blur over rows; rest is two-row, work is accent-outlined |
| Progress | `.wprog`, `.streak-bar-fill`, `.mrow .bar` | 4–6px accent bar on `--surface-2` |
| Heatmap / body map | `.hm-*`, `.bodymap` / `.bm-*` | one accent level ramp `l1–l4` shared by both; fatigue view swaps to red/orange/yellow, strength pops gold |
| Badges | `.home-badge`, `.tag`, `.pr` | status colour only (orange active, accent scheduled, green done, gold PR) |
| Toast | `#toast` | blurred pill above tab bar |
| Empty states | `.empty` | icon + one quiet line, never guilt-tripping |
| Desktop ≥1000px | `.cols`, `.narrow` | 2-column grid, floating 520px tab bar, centred 640px sheets |

## Conventions and gotchas (learned the hard way — kept as comments in code)

- Icons are single-stroke `<svg class="icn">` from `components/Icon.jsx`,
  inheriting `currentColor` and optical size (`--icon-stroke`) from context;
  overlapping strokes double alpha under transparency, so fades go on the
  `<svg>`, not the stroke colour.
- Capitalisation is opt-out, not opt-in: dataset text arrives lowercase and
  `.tag`/`.chip`/`.capitalize` lift it; units and sentences use `.nocap`
  ("60 kg", never "60 Kg").
- Cleared optional values are key-**deleted**, not zeroed; the same honesty
  applies visually — a missing average is a dash, never a fake number.
- Supersets are drawn with an inset accent edge (`.item.in-ss`,
  `.ss-card` outline), not coloured fills.
- Accent-meaning consistency: green/lime = progress & done, orange = active
  workout & misses, yellow/gold = records & strength, red = destructive.
- One accent level ramp (`l1–l4` via `color-mix`) means one thing everywhere
  (heatmap, body map); a new data-colour use should reuse it rather than add a
  second scale.
- Layout is a single 560px column on phones, two columns ≥1000px; never design
  a free-width layout.

## Anti-patterns (explicitly banned here)

- Inter/Arial/system-default as an identity font; font-weight 700+ on body copy.
- Gray text on coloured backgrounds; pure black/grey without tint.
- Cards nested inside cards; borders where a hairline would do.
- Bounce/elastic easing; decorative slides; motion longer than ~350 ms
  (the sheet's 340 ms is the ceiling).
- New hues outside the system palette; gradients except the two hero tints.
- Sub-44px interactive targets (the `.setrow.eff3` stepper exceptions are
  computed against the row, not ad-hoc).
