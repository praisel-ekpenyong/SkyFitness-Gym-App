# DESIGN.md — Sky

The "Iron" visual system, as built in `frontend/src/styles/`. Product truth (audience,
constraints, voice) lives in [PRODUCT.md](PRODUCT.md); domain vocabulary lives in
[GLOSSARY.md](GLOSSARY.md). Any new design work follows the rules below.

## The idea

**Sky's mark is a loaded bar, and every set draws your own.** The app is built like the gym floor
it is used on: rubber-black ground, chalk-white ink, stamped condensed numbers, machined keys, and
competition plates in their real colours. It is read at arm's length, between sets, by someone out
of breath, so on the screens read from the bench the number is the largest thing.

## The tests are the rules

This file explains the rules; two tests hold them, and `npm test` (the pre-commit hook) runs both.
Each failure names the rule it breaks and the section of this file to read.

- **G1, `frontend/src/design-tokens.test.js`** reads `styles/tokens.css` the way the browser
  resolves it, per theme and per accent, and holds every contrast and hue promise under Tokens.
- **G2, `frontend/src/design-lint.test.js`** reads `styles/*.css` and every component. It holds the
  type scale and the weights (Type), keeps type out of inline styles, and keeps each meaning colour
  on an allowlist: `WORK` for the accent, `RECORD` for yellow, `RUNNING` for orange (and their
  `_JS` lists for the few inline uses). Every entry names its use; an entry that no longer matches
  anything fails as stale.
- **`npm run review:audit`** measures the built app on phone (390x844), small (360x640), tablet and
  desktop in both themes: overflow, 44px targets, the contrast of rendered text, type under 11px.
  It is run by hand, not by `npm test`.

A new colour use, size or weight that the guards reject is a design decision: change the rule
here and the list or scale in the test together, never one without the other.

## The five rules

1. **The number is the hero.** One family, two widths. Condensed and heavy for what is read from the
   bench (loads, reps, the rest clock, a routine's name wherever one is picked: Home, Plan's cards and
   week rows, the Start tab, the Routine screen); normal width for what is read up close (the
   workout header's name, a logged Workout in a list). On the screens read from the bench (the
   workout, the rest dock, the weigh-in) the figure is the largest thing. On Finish the workout's
   figures (56px) outsize its title (44px); a figure too wide for its half takes the full width
   rather than break or shrink. A routine's name beside a muscle map (the Home hero, Plan's Routine
   cards) breaks at spaces only and steps 56/44/34/28px on a phone by the measured width of its
   longest word (`lib/name-fit.js`); if no step fits, the name takes the full width and the map
   sits below it. The step is chosen on a phone; whether the map moves below is decided per layout
   (phone, tablet, desktop), so a name stays beside the map wherever its column holds it
   (`.name-stacked-phone`, `-tablet`, `-desktop`).
2. **Elevation is lightness.** A warm near-black ground and three flat steps above it. No borders or
   shadows on anything at rest. Only what truly floats (a dialog, a toast) may cast a shadow. No
   gradients, no glass, no glow.
3. **Colour is work.** The accent marks work and nothing else: the one `.go` key on a screen (Start,
   Log set; in time Mode the console's lime key is "Start set", `.setrow.cur.timed .setgo`, and
   "Log set" is a neutral `--surface-3` key, so a console still has one `.go` key), the workout
   header's Finish once every set is done (a colour state, `.wk-finish.done`, on the header key's
   own size and words; it never takes `.go`), logged-set marks (the check key, the set number,
   session segments), chart and data ink (lines, the heatmap, volume bars, this week's session
   blocks), the trained-muscle map, trained days (calendar, Home's week strip, "Completed today"),
   the rest-dock bar and the clock while a timed set is held. Favourites, switches, today,
   prescriptions, selections and supersets are ink. Every other primary action is inverted ink;
   nav, tabs and ordinary buttons stay neutral. G2 `WORK` holds the list.
4. **Tight, machined shapes.** `--r-2` 8px on blocks and large keys, 4–6px on small keys and marks,
   `--r-3` 16px only on sheets. UI shapes are never round: a check is a square key, a switch has a
   square knob, the "in progress" dot is a square. Two things may be round: data marks (the points
   on a chart) and the drawings inside icons (a clock face, a plate).
5. **Motion acknowledges.** Presses, sheets and the rest dock respond in 120–260ms on one ease-out
   curve. Nothing performs an entrance, bounces or runs on its own, except the one pulsing "in
   progress" dot. `prefers-reduced-motion` drops the travel and keeps the content, and stills the dot.

## Type

**Archivo** (variable, OFL, bundled via `@fontsource-variable/archivo`), a single 90 KB Latin file
carrying both axes. It is bundled, never fetched from a font host: the CSP is same-origin, the app
must open offline, and a plain build phones nowhere.

| Role | Setting | Where |
|---|---|---|
| Display | `wdth 62`, 800, uppercase, leading ~.94 | Screen titles, routine and exercise names, sheet titles |
| Figure | `wdth 62`, 700, tabular | Loads, reps, KPIs, the rest clock |
| Heading | `wdth 100`, 600, sentence case | Card titles, list groups, keys |
| Body | `wdth 100`, 400 | Everything else |
| Meta | `wdth 100`, 400, grey | Labels, sublines, units, axis ticks |

Weights are 400, 600, 700 and 800 only (G2). There is no 500.

### The scale

Every `font-size` in `styles/*.css` is one of twelve tokens in `styles/tokens.css`, and only that
file holds a px size (G2). At most five steps sit above 24px. An icon takes the step of the text it
sits with.

| Token | px | Where |
|---|---|---|
| `--fs-micro` | 11 | The floor: chart ticks, heatmap labels, tab labels on a phone |
| `--fs-meta` | 13 | Labels, sublines, units (`.u`), captions |
| `--fs-small` | 14 | Secondary text, small keys, chips |
| `--fs-body` | 15 | Body, headings, keys, tab labels in the desktop sidebar |
| `--fs-field` | 16 | Form fields and the root (iOS zooms the page on focus below 16px) |
| `--fs-lead` | 18 | Icons on keys and rows, tab icons in the desktop sidebar, small figures |
| `--fs-figure` | 22 | Figures in a row, the `.go` key's label, tab icons on a phone |
| `--fs-heading` | 28 | Display: sheet titles, names in tight places (a routine on Plan's week rows) |
| `--fs-title` | 34 | Display: screen titles on a phone, KPI figures |
| `--fs-display` | 44 | Display: screen titles on desktop, exercise names, the Finish title |
| `--fs-poster` | 56 | Display: the Home hero on a phone, Finish's figures, the weight on Home |
| `--fs-hero` | 68 | The open set's figures, the rest clock, the weigh-in figure, Stats' Best, the Home hero on desktop |

Display sizes deliberately pass what a dashboard would use, because this screen is read from a
bench. G2 holds the two that matter most: the open set's figures stay at 64px or more, and the rest
clock is the largest size there is. Labels are sentence case and untracked.

### Numbers

- **Signed figures** go through `fmtSigned` (`lib/format.js`): the minus is U+2212 "−", a gain
  carries "+", and a figure that rounds to zero carries no sign.
- **Counts and loads** go through `fmtNum`: a thousands separator in the user's locale ("8,200 kg",
  "1,324 exercises").
- **Units** are a small `.u` beside the figure (`--fs-meta`, normal width, `--label-2`). A tile names
  its figure once, in the label above it: "Sets" over "4", never "4 sets".
- **Missing is a dash, zero is a zero.** No Records on Finish reads 0.

## Tokens (`styles/tokens.css`)

- **Ground:** `--bg` `#0a0a09` → `--surface` `#1f1f1d` → `--surface-2` `#2e2e2b` →
  `--surface-3` `#3b3b37`; `--bg-el` `#151514` for sheets. Each dark step is about 1.2:1 over the one
  below (G1 holds at least 1.15:1). Light ("chalk") runs the same steps from `#f3f3f0`.
- **Ink:** `--label`, `--label-2`, `--label-3` all hold ≥4.5:1 on every surface, `--surface-3`
  included, in both themes (G1). `--label-4` is for marks only, never words. `--ink` / `--on-ink`
  are the inverted primary.
- **Accent:** `--acc` (fill, per profile via `data-accent`, default lime `#a3e635`, the app icon's
  own colour), `--acc-text` (accent as words), `--data` (accent as chart ink). Five accents: lime,
  sky, violet, pink, teal (G1 checks them against `ACCENTS` in `lib/format.js`). Gold, red and
  orange are retired because they read as a Record, a deletion and a running workout; a stored
  profile on one of them reads as lime, and the stored value is left as it was. Every accent
  carries a black `--on-acc` label at 4.5:1 and stays at least 20° of hue from `--red`, `--orange`
  and `--yellow` (G1). In light theme `--acc-text` is a 45% mix toward black and `--data` a 62% mix;
  in dark, pink's `--acc-text` lifts to `#ff7dac`. Never use `--acc` itself for text or lines.
- **Status:** each colour means one thing, and each has a `-text` partner for words.
  - `--yellow` / `--goal-text` is a Record and nothing else: the moment a Set beats the exercise's
    Best or its best estimated 1RM. That is the `.record` utility, the `.pr` Record badge, and the
    Set in Stats history that made a Record (`.set-pill.record`, the heaviest Set of that session).
    The standing Best figure (the heaviest load) is neutral ink, `--label`, wherever it shows (the
    Stats headline, the workout header, Library), never yellow. This narrows iron-discipline D3, per
    design-review-fixes E12 (path a) and the Record decision of 2026-11-14. G2 `RECORD` holds it.
  - `--orange` / `--orange-text` is a workout that is running, and nothing else: the `.live`
    Resume key, the tab bar's Start key while a workout runs (`.rec`) and Home's "In progress"
    badge. A rescheduled day is a `--label-2` ink mark. G2 `RUNNING` holds it.
  - `--red` / `--red-text` is destructive (`.danger`, Discard) and fatigued (the fatigue map is one
    red ramp over the map base). In dark, `--red-text` is `#ff847b`, lighter than the fill, so it
    holds 4.5:1 on `--surface-2` and `--surface-3`.
  - Warnings, notes, deload lines and milestone badges ("8/8 reps") are neutral: `--label-2`, on a
    `--surface-3` fill or none, with an icon if they need one.
  - Every `-text` token holds 4.5:1 on every surface in both themes under every accent, and
    `--data` holds 3:1 on the grounds a chart sits on (G1).
- **Plates:** `--plate-*`, the competition colour code. They belong to the object: used on plates and
  nowhere else, and the only polychrome in the app.
- **Art:** `--art-filter` turns the white-ground exercise art into an X-ray on `--art-ground` black
  (`invert` + `hue-rotate` puts the red target muscle back); light theme shows it untouched.
  `--art-paper` is the art's white paper, painted under `--art-filter`, so an image still loading
  shows `--art-ground` in either theme. When every URL for an image fails, the thumbnail, the
  Library tile and the animation show the dumbbell tile (`.thumb-x`) at their own size, with no
  `<img>` and no alt text. Inside `.exmedia`, `.ex-art` sits on whichever stands there, the art
  `<img>` or the dumbbell tile, so size rules target `.ex-art` and never the `<img>`.
- **Space and geometry:** `--pad` 16px is the edge of a page, a block and a sheet; `--gap` 12px is
  the space between blocks. Radii are `--r-1` 4px, `--r-2` 8px and `--r-3` 16px (sheets only);
  `--tap-target` is 44px. Other spacing is written in px in the component's rule; it is not yet a
  scale and no guard holds it.

## Icons

- One set, `components/Icon.jsx`: [Tabler Icons](https://tabler.io/icons) outline glyphs, their
  path data copied in (no icon package ships). Tabler draws no dumbbell, flexed arm or fist, so
  `dumbbell`, `arm` and `boxing` are Lucide's `dumbbell`, `biceps-flexed` and `hand-fist`, drawn on
  the same grid. A new glyph comes from Tabler first and Lucide second, and is credited in
  `NOTICE.md`; Sky does not hand-draw icons.
- 24×24 grid, stroke only (two small shapes are solid: `starFill` is Tabler's filled star, and
  `dot`), `currentColor`, round caps and joins. `alert` (Tabler `alert-triangle`) marks the
  neutral banners.
- **Keys are Sky's names, not the libraries'.** A routine stores its glyph's key, so a key is
  never renamed or removed: redraw it instead. A name with no glyph draws nothing, so
  `Icon.test.js` fails on any name the source uses that the set lacks. Where the source differs:
  `figureStrength` is Tabler `stretching-2`, `legs` `stretching`, `pullup` `gymnastics`, `abs`
  `body-scan`, `stretch` `yoga`, `machine` `treadmill`, `kettlebell` `weight`, `plate` `disc`,
  `swim` `swimming`, `timer` `stopwatch`, `scale` `scale-outline`, `chart` `chart-bar`,
  `lightbulb` `bulb`, `reset` `rotate`, `shuffle` `arrows-shuffle`, `wrench` `tool`, `globe`
  `world`, `info` `info-circle`, `checkCircle` `circle-check`, `personCircle` `user-circle`,
  `signOut` `logout`, `expand` and `minimize` `arrows-diagonal(-minimize)`, `play` and `pause`
  `player-play` and `player-pause`, `house` `home`, `magnifier` `search`, `gear` `settings`,
  `person` `user`, `xmark` `x`, `bellSlash` `bell-off`.
- **Stroke** is `--icon-stroke`, 1.6 by default; both libraries are drawn for 2, and Sky sets
  them lighter. A key or mark that needs more weight sets it locally (2 to 2.6 on check keys, the
  `.go` key and selected tabs).
- **Size** is `1em`: an icon takes the `--fs-*` step of the text it sits with (`--fs-lead` on keys
  and rows, `--fs-small` on `.xs` keys, `--fs-figure` in the phone's tab bar and on the `.go` key,
  `--fs-lead` in the desktop sidebar).
- **Colour** is the text's. An icon is never set in a tinted square or circle; a grouped-list icon
  is plain grey.

## Signature pieces

| Piece | Where | Notes |
|---|---|---|
| **The barbell** | `components/Barbell.jsx`, `lib/plates.js` | The open set of a straight-bar lift, drawn with real plates, heaviest inside. Always names its bar and states in words what the colours show ("20 kg bar + 25 + 15 per side"); a load no plates can make is reported, never rounded. EZ, trap and Smith bars are not drawn: their weight is unknown. |
| **The set ladder** | `views/Workout.jsx` | The set in front of you is one large console (figure over two keys, the bar, one Log key). Every other set is one line, still typeable, one tap from opening. The console stays on screen as it moves down the page. Once every work set of the open entry or superset is done and another follows, the ladder ends in one inverted, full-width key, "Next: <exercise>" (`.wk-next`), in every mode; the last one opens the complete sheet instead, and an uncheck takes the key away. |
| **Exercise tools** | `.extools` | Note, Replace and Details are `.btn.xs` keys, an icon and a word each, under the name and the art; Rest closes the row on the right as the timer and the duration ("1:30", named "Rest 1:30"), so the row holds one line at 360px. |
| **Focus mode** | `App.jsx`, `body.focus-session` | While a workout is on screen the phone's tab bar steps aside. The header's chevron minimizes to the rest of the app. |
| **The rest dock** | `components/RestTimer.jsx` | The clock is on the largest step (`--fs-hero`); nothing on the phone is larger while it runs. |
| **Session segments** | `.lad` | One segment per exercise, filling with its work sets: position at a glance and a one-thumb jump. With the header's set count ("0/19 sets") they are the workout's only progress; there is no "Exercise N / M" line. |
| **Poster hero** | `views/Home.jsx` | Today's routine set huge beside the muscle map it hits: `--fs-poster` on a phone, `--fs-hero` on desktop, a step down when a word is still too wide. A rest day shows what is still recovering instead. |
| **Weigh-in** | `sheets.jsx` (`.bw-num`, `.bw-pm`) | The figure is on `--fs-hero` and typeable. Two keys either side step it, each with its step written on it ("−0.1", "+0.1"). |
| **Finish screen** | `FinishSummary`, sheet `kind: 'full'` | A full-screen takeover: the workout, stated. The figures lead (`--fs-poster`) and the title sits a step below (`--fs-display`). A figure never breaks: when one is too wide for its half ("31,920 kg" at 360px), Duration and Volume each take the full width (`.finish-kpis.tight`), measured, not guessed. |

## Component vocabulary

| Part | Class | Notes |
|---|---|---|
| Screen title | `.hdr h1` | Display face, `--fs-title` on a phone and `--fs-display` on desktop; `.hdr-back` adds a back key |
| Block | `.card` | `--surface`, no border |
| Figures | `.tiles` / `.tile` | One block split by hairlines, label over value, no icons |
| Row stack | `.list` / `.item` | Rows on a 3px gap |
| Grouped list | `.sect-b` / `.lrow` | Settings and pickers; plain grey icons, never in a tinted square |
| Buttons | `.btn` + `.primary` `.go` `.live` `.plain` `.ghost` `.danger` `.sm` `.xs` | `.go` is the one coloured key; `.live` is the running workout |
| Delete routine | `.btn.ghost.rt-delete` | A red text key (`--red-text`, no fill) on the Routine screen, with 24px clear above it. The confirm dialog stays |
| Long routine name | `.home-hero-body` / `.rt-card` + `.name-stacked-phone` `-tablet` `-desktop` | The name over the full width, the map below it, on each layout where no size step fits the longest word beside the map; `fitName` and `stackClasses` (`lib/name-fit.js`) decide, and each rule holds only inside its layout's media range (`NAME_MEDIA`) |
| Starter card | `StarterCard` (`.home-hero.welcome`) | One component: Home's first-run hero and Plan with no Routines ("Load starter plan" / "Build my own plan"; each screen passes its own "Build my own plan" action) |
| Discard workout | `.btn.ghost.wk-discard` | A red text key (`--red-text`, no fill) in the workout footer. Like `.rt-delete`, it names `.btn.ghost` so it outranks the ghost's grey |
| Finish | `.wk-finish` | On the workout screen Finish is the header key only: `.plain` until every set is done, then `.done`, the accent fill on the same small key (never `.go`, so `.go` keeps one look). The footer holds Discard. The confirm states an early finish ("3 of 6 exercises done") |
| Stepper | `.stp` | One line in sheets; stacked figure-over-keys in the console |
| Set key | `.chk` | 44px square; becomes the full-width Log key in the console |
| Switch | `.sw` | Square knob. On: `--ink` track, `--on-ink` knob. Off: `--surface-3` track, `--label-3` knob. A setting, not work, so never the accent |
| Accent picker | `.swatches` / `.swatch` | One row of five 44px squares inside the Appearance list |
| Chips | `.chips` / `.chip` | Filters; selected is inverted |
| Notes and warnings | `.warn-note`, `.progline.warn`, `.eff-off`, `.milestone-badge` | Neutral: `--label-2`, on a `--surface-3` fill or none |
| Sheets | `.sheet` `.center` `.fullsheet` | Bottom sheet, dialog, takeover |
| Charts | `components/LineChart.jsx` | Drawn in real pixels from a measured width; one 2px straight line on a 10% flat fill, 3–4 faint gridlines, round data points |

Desktop (≥1000px) is the same DOM: `#tabbar` stands up as a labelled sidebar by CSS alone and screens
take two columns from the same source order. In the tab bar Start is a tab like the others (icon and
label on the same baseline); it turns orange only while a workout runs.

## Conventions

- **Hooks are contracts.** Tests bind to class names (`.setrow`, `.list .item`, `.tag`, `.home-hero-meta`,
  `.exnote`, `#timer`) and to accessible names. Restyle freely; rename deliberately.
- **Type is set by class, with a `--fs-*` token.** Never inline (`fontSize`, `fontWeight`) in a
  component: G2 cannot see it there and fails it.
- **A new meaning colour needs an allowlist entry.** A new use of the accent, yellow or orange goes on
  `WORK`, `RECORD` or `RUNNING` in `design-lint.test.js` with the use it is, or it is ink.
- **Every target reaches the thumb.** 44px on anything interactive, by size or by a `::after` hit area
  where the drawing is smaller (`.sw`, `.chip`, `.seg button`).
- **The narrowest screen is 360px.** Layouts and the 44px rule are held from 360px up (the review
  harness audits 360x640). Narrower phones still work, but a seven-day week strip cannot give each day 44px there.
- **Capitalisation.** Exercise names arrive lowercase and `.capitalize` lifts them. Dataset names in
  chips, tags and meta lines are sentence case through `sentenceCase` and `.nocap` ("Body weight",
  "EZ barbell"), never title case. Never capitalise a string with a unit in it: "60 kg", never "60 Kg".
- **Meta lines.** " · " is the only inline separator (`dotted()` in `components/ui.jsx` for element
  lists). A label and its value are separated by a space, with no colon ("Best 95 kg", "Last time
  2 Nov · 8,200 kg").
- **Copy.** "and", never "&" (Archivo's ampersand reads oddly); "…", never "...".
- **Missing is a dash, zero is a zero.** An empty chart draws its frame; an empty map draws the body.
- **Colour says good or bad, not up or down.** The weight delta and the month recap deltas are the two
  places where the accent means "good" (`--red-text` is "bad"); the delta is a signed figure with no
  arrow. A month still under way is not behind anything yet, so its shortfall shows no comparison.
  No streak flames, no guilt.
- **New words go through `t()`** and follow the glossary.

## Accepted trade-offs

Known, measured, and kept on purpose:

- The lime `.go` key has a 1.5:1 edge on a white block in light theme. Its label identifies it, and
  WCAG 1.4.11 does not ask a key with a text label for a 3:1 edge.
- The focus-mode `scroll-padding-top` in `base.css` is 96px against the 106px workout header; the
  console adds `scroll-margin-top: 10px`, so its top lands at the header's foot. A 106px header
  token in place of both was measured and moves nothing: at 360x640 the Log key ends at 518 with
  the rest dock at 554 either way, and at 768x1024 the third logged Set still leaves part of the
  exercise name under the header. That comes from `block: nearest` scrolling only far enough to
  show the console's foot; fixing it needs a scroll that knows where the name is (JS).
- The green 10 kg plate can sit beside the lime key. Plates keep the object's colours.
- Lime is Tailwind's lime-400 (`#a3e635`). It is the app icon's colour; Sky's identity rests on the
  barbell, not the hue.

## Banned here

Gradients, glass, glows, drop shadows on resting blocks, icons in tinted squares, pill badges above a
title, tracked uppercase labels, emoji, a hue per chart, round UI shapes, font sizes off the scale,
weights other than 400/600/700/800, type under 11px, targets under 44px, and any font or asset
fetched from a third-party host.
