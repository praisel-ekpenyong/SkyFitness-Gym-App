# DESIGN.md — Sky

The "Iron" visual system, as built in `frontend/src/styles/`. Product truth (audience,
constraints, voice) lives in [PRODUCT.md](PRODUCT.md); domain vocabulary lives in
[GLOSSARY.md](GLOSSARY.md). Any new design work follows the rules below.

## The idea

**Sky's mark is a loaded bar, and every set draws your own.** The app is built like the gym floor
it is used on: rubber-black ground, chalk-white ink, stamped condensed numbers, machined keys, and
competition plates in their real colours. It is read at arm's length, between sets, by someone out
of breath, so the number is always the largest thing on the screen.

## The five rules

1. **The number is the hero.** One family, two widths. Condensed and heavy for what is read from the
   bench (loads, reps, the rest clock, routine names); normal width for what is read up close.
2. **Elevation is lightness.** A warm near-black ground and three flat steps above it. No borders or
   shadows on anything at rest. Only what truly floats (a dialog, a toast) may cast a shadow. No
   gradients, no glass, no glow.
3. **Colour is work.** The accent marks work done (logged sets, progress, trained muscles, chart
   lines) and the one control that does it (Start, Log set, Finish). Every other primary action is
   inverted ink. Nav, tabs and ordinary buttons stay neutral.
4. **Tight, machined shapes.** 8px on blocks and keys, 4–6px on small marks, 16px only on sheets.
   There are no circles and no pills: a check is a square key, a switch has a square knob.
5. **Motion acknowledges.** Presses, sheets and the rest dock respond in 120–260ms on one ease-out
   curve. Nothing performs an entrance, bounces or runs on its own, except the one pulsing "in
   progress" dot. `prefers-reduced-motion` drops the travel and keeps the content.

## Type

**Archivo** (variable, OFL, bundled via `@fontsource-variable/archivo`), a single 90 KB Latin file
carrying both axes. It is bundled, never fetched from a font host: the CSP is same-origin, the app
must open offline, and a plain build phones nowhere.

| Role | Setting | Where |
|---|---|---|
| Display | `wdth 62`, 800, uppercase, leading ~.94 | Screen titles, routine and exercise names, sheet titles |
| Figure | `wdth 62`, 700, tabular | Loads, reps, KPIs, the rest clock |
| Heading | `wdth 100`, 600, 15px, sentence case | Card titles, list groups |
| Body | `wdth 100`, 400, 15px | Everything else |
| Meta | `wdth 100`, 400, 12–13px, grey | Labels, sublines, axis ticks (11px is the floor) |

Display sizes deliberately pass what a dashboard would use, because this screen is read from a
bench: the open set's figures are 66px and the rest clock 68px. Labels are sentence case and
untracked. Inputs stay at 16px or larger, the line below which iOS zooms the page on focus.

## Tokens (`styles/tokens.css`)

- **Ground:** `--bg` `#0a0a09` → `--surface` `#161615` → `--surface-2` `#232321` →
  `--surface-3` `#30302d`; `--bg-el` for sheets. Light ("chalk") runs the same steps from `#f3f3f0`.
- **Ink:** `--label`, `--label-2`, `--label-3` all hold ≥4.5:1 on every surface they sit on.
  `--label-4` is for marks only, never words. `--ink` / `--on-ink` are the inverted primary.
- **Accent:** `--acc` (fill, per profile via `data-accent`, default lime `#a3e635`, the app icon's
  own colour), `--acc-text` (accent as words), `--data` (accent as chart ink). In light theme the
  last two darken so they can be read on white; never use `--acc` itself for text or lines.
- **Status:** `--orange` a workout is running, `--yellow` records and strength, `--red` destructive
  and fatigued. Each has a `-text` partner where it differs.
- **Plates:** `--plate-*`, the competition colour code. They belong to the object: used on plates and
  nowhere else, and the only polychrome in the app.
- **Art:** `--art-filter` turns the white-ground exercise art into an X-ray on `--art-ground` black
  (`invert` + `hue-rotate` puts the red target muscle back); light theme shows it untouched.

## Signature pieces

| Piece | Where | Notes |
|---|---|---|
| **The barbell** | `components/Barbell.jsx`, `lib/plates.js` | The open set of a straight-bar lift, drawn with real plates, heaviest inside. Always names its bar and states in words what the colours show ("20 kg bar + 25 + 15 per side"); a load no plates can make is reported, never rounded. EZ, trap and Smith bars are not drawn: their weight is unknown. |
| **The set ladder** | `views/Workout.jsx` | The set in front of you is one large console (figure over two keys, the bar, one Log key). Every other set is one line, still typeable, one tap from opening. The console stays on screen as it moves down the page. |
| **Focus mode** | `App.jsx`, `body.focus-session` | While a workout is on screen the phone's tab bar steps aside. The header's chevron minimizes to the rest of the app. |
| **The rest dock** | `components/RestTimer.jsx` | The clock is the largest thing on the phone while it runs. |
| **Session segments** | `.lad` | One segment per exercise, filling with its work sets: position at a glance and a one-thumb jump. |
| **Poster hero** | `views/Home.jsx` | Today's routine set huge beside the muscle map it hits. A rest day shows what is still recovering instead. |
| **Finish screen** | `FinishSummary`, sheet `kind: 'full'` | A full-screen takeover: the workout, stated. |

## Component vocabulary

| Part | Class | Notes |
|---|---|---|
| Screen title | `.hdr h1` | Display face; `.hdr-back` adds a back key |
| Block | `.card` | `--surface`, no border |
| Figures | `.tiles` / `.tile` | One block split by hairlines, label over value, no icons |
| Row stack | `.list` / `.item` | Rows on a 3px gap |
| Grouped list | `.sect-b` / `.lrow` | Settings and pickers; plain grey icons, never in a tinted square |
| Buttons | `.btn` + `.primary` `.go` `.live` `.plain` `.ghost` `.danger` `.sm` `.xs` | `.go` is the one coloured key; `.live` is the running workout |
| Stepper | `.stp` | One line in sheets; stacked figure-over-keys in the console |
| Set key | `.chk` | 44px square; becomes the full-width Log key in the console |
| Chips | `.chips` / `.chip` | Filters; selected is inverted |
| Sheets | `.sheet` `.center` `.fullsheet` | Bottom sheet, dialog, takeover |
| Charts | `components/LineChart.jsx` | Drawn in real pixels from a measured width; one 2px straight line on a 10% flat fill, 3–4 faint gridlines |

Desktop (≥1000px) is the same DOM: `#tabbar` stands up as a labelled sidebar by CSS alone and screens
take two columns from the same source order.

## Conventions

- **Hooks are contracts.** Tests bind to class names (`.setrow`, `.list .item`, `.tag`, `.home-hero-meta`,
  `.exnote`, `#timer`) and to accessible names. Restyle freely; rename deliberately.
- **Every target reaches the thumb.** 44px on anything interactive, by size or by a `::after` hit area
  where the drawing is smaller (`.sw`, `.chip`, `.seg button`).
- **The narrowest screen is 360px.** Layouts and the 44px rule are held from 360px up (the review
  harness audits 360x640). Narrower phones still work, but a seven-day week strip cannot give each day 44px there.
- **Capitalisation is opt-out.** Dataset names arrive lowercase and `.capitalize` lifts them. Never
  capitalise a string with a unit in it: "60 kg", never "60 Kg".
- **Missing is a dash, zero is a zero.** An empty chart draws its frame; an empty map draws the body.
- **Colour says good or bad, not up or down.** A month still under way is not behind anything yet, so
  its shortfall reads neutral. No streak flames, no guilt.
- **New words go through `t()`** and follow the glossary.

## Banned here

Gradients, glass, glows, drop shadows on resting blocks, icons in tinted squares, pill badges above a
title, tracked uppercase labels, emoji, a hue per chart, circles as a shape language, type under 11px,
targets under 44px, and any font or asset fetched from a third-party host.
