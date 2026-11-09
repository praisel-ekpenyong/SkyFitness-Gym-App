# PRODUCT.md — Sky

<!-- impeccable:product-schema 1 -->

Durable product truth, recorded for design work (Impeccable `/impeccable init`).
This file holds audience, purpose, operating context, constraints, and voice —
**not** surface-level visual direction. The visual system is documented in
[DESIGN.md](DESIGN.md) and in the header of `frontend/src/index.css`. Domain
vocabulary is defined in `GLOSSARY.md`.

## Platform

web

## What Sky is

A single-user, no-login, backend-free gym and body-weight tracker. Plan
routines, log workouts against them, and derive progression, strength and
recovery from what was actually logged. Everything lives on the device.

Sky ships as a static frontend only — no server, no API, no cloud sync.

## Audience

Any lifter, one per install. Sky is free and open to anyone, and each install
serves exactly one person: the lifter who runs it. There is no account, no
login, no multi-person mode — guest mode is the only mode. Inside the app every
visitor is the owner, and every greeting on Home is addressed to them alone.

The landing page (`landing/index.html`) has a second audience: a lifter deciding
whether to try Sky. Once they open the app, they are the owner.

## Purpose

Three jobs, in order:

1. **Plan** — routines and a week schedule, with day overrides for real life.
2. **Log** — guided sessions: sets × reps/seconds/minutes, optional effort
   ratings, weigh-ins, warm-ups marked as such.
3. **Derive** — progression prescriptions, estimated 1RM and records,
   fatigue and strength-retention maps — read only from what was logged.

## Positioning

Your log stays on your device, and every number Sky gives you comes from that
log and can explain why. No server, no flattery.

Both halves are structural: there is no backend to send data to (ADR 0001), and
prescriptions are read only from what was logged and carry their own `why`.

## Operating context

- **Phone-first, mid-workout.** The primary surface is a phone in one hand
  between sets: short attention windows, sweaty thumb targets, a rest timer
  counting down. The 44px tap-target token and fixed-UI clearances exist for
  this; desktop is a convenience, not the target.
- **Offline, always.** Static build with no backend (ADR 0001), guest-only
  boot (ADR 0002). After first load the network is optional — exercise media
  comes from bundled files when the build includes them, otherwise from a
  pinned public CDN, and falls back gracefully; nothing else needs it.
- **Two homes.** The PWA in a browser, and Capacitor shells on iOS/Android
  whose native file mirror means backgrounding can never lose a session
  (ADR 0004). iOS Safari is a first-class citizen — its WebView can evict
  localStorage, which is why state is dual-written. The shells wrap the same
  interface as the PWA, so design work targets one mobile-first web interface
  with no per-OS design language.
- **Hosted statically.** The app is served from `skyfitness.pages.dev`
  (Cloudflare Pages), with Netlify also configured (ADR 0010). The build stays
  host-agnostic.
- **One-handed reading of numbers.** Weight, reps, rest seconds and effort
  are the app's payload; they use tabular numerals and are never decorative.

## Capabilities

- **Catalogue:** 1,324 built-in exercises with muscle filters, plus the lifter's
  own custom exercises.
- **Progression:** linear, Greyskull, double progression, add-time, and a
  bodyweight path.
- **History in:** FitNotes, Strong, Hevy and Apple Health imports merge into the
  profile.
- **Data out:** one JSON backup file holds the whole profile, with a reminder
  after 14 days without one.
- **Plan sharing:** a plan file carries routines only — never workouts, weigh-ins
  or settings.

## Constraints (durable)

- **No server, ever.** Every feature must work from local data alone;
  anything needing cloud sync is a non-feature. (ADR 0001)
- **English only.** Strings stay wrapped in `t()` so a later language remains
  a one-file change. (ADR 0003)
- **Telemetry-free plain builds.** Analytics only when explicitly configured
  at build time; the default build phones nowhere.
- **Data honesty over engagement.** Finished workouts freeze the target they
  were trained against; fixing a mistyped set immediately changes the next
  prescription. The UI must never flatter the log — an unticked set is a miss,
  stated plainly.
- **No invented data.** Estimates are refused where formulas disagree
  (e1RM above 12 reps); averages below a rated-set floor render as a dash
  rather than a misleading number.

## Voice

Plain, declarative, no hype. Every number comes with a reason — "why this
number?" must always be answerable, because prescriptions carry a
translatable `why` template. No streaks, no guilt, no gamified nags: a
missed session is reported, not punished. Domain vocabulary follows
`GLOSSARY.md` exactly (**workout**, not session-as-record; **entry**,
**set**, **target**; "Rescheduled", not "re-planned"). Units are lower-case
("60 kg" never "60 Kg").

## Non-goals

Accounts, multi-user, cloud sync, social features, coach marketplaces,
push servers. A design idea that needs any of these is out of scope.

## Accessibility & Inclusion

WCAG AA contrast in both dark and light themes is a public commitment
(README.md). Every interactive target is at least 44px, and reduced-motion
preferences are respected.

## Evidence on hand

- **Screenshots:** `assets/screenshots/` holds five mobile screens dated
  2026-09-24. They predate the Iron rebuild (2026-11-09) and show the old
  interface, so they cannot stand in for the current look until retaken.
- **Photos:** gym photos in `assets/`, with creators and licences in
  `assets/credits.json`.
- **Absent:** the repo holds no testimonials, user counts, reviews, press or
  benchmarks. Future work must not invent them.

## Evidence quality

- Audience, positioning, platform: **CONFIRMED** by the owner, 2026-11-09.
- Product purpose, constraints: **HIGH** — README.md, GLOSSARY.md, docs/adr/,
  and docs/architecture.md agree with each other and with the code.
- Capabilities: **HIGH** — checked against `frontend/src/lib/`.
- Operating context: **HIGH** — tap-target and safe-area tokens, the
  dual-write storage protocol, and Capacitor shells are all in the code.
- Voice: **HIGH** — demonstrated by architecture-doc prose and existing copy
  conventions; spot-checked, not exhaustively audited.
- Accessibility: **STATED** — in README.md and DESIGN.md; contrast was not
  measured during this update.
- Which surface needs design attention first: **not yet recorded** — chosen
  per run, not durable truth.
