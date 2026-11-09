# PRODUCT.md — Sky

Durable product truth, recorded for design work (Impeccable `/impeccable init`).
This file holds audience, purpose, operating context, constraints, and voice —
**not** surface-level visual direction. The visual system is documented in
[DESIGN.md](DESIGN.md) and in the header of `frontend/src/index.css`. Domain
vocabulary is defined in `GLOSSARY.md`.

## What Sky is

A single-user, no-login, backend-free gym and body-weight tracker. Plan
routines, log workouts against them, and derive progression, strength and
recovery from what was actually logged. Everything lives on the device.

Sky ships as a static frontend only — no server, no API, no cloud sync.

## Audience

Exactly one person: the lifter who runs it. There is no account, no login,
no multi-person mode — guest mode is the only mode. Every visitor is the
owner, and every greeting on Home is addressed to them alone.

## Purpose

Three jobs, in order:

1. **Plan** — routines and a week schedule, with day overrides for real life.
2. **Log** — guided sessions: sets × reps/seconds/minutes, optional effort
   ratings, weigh-ins, warm-ups marked as such.
3. **Derive** — progression prescriptions, estimated 1RM and records,
   fatigue and strength-retention maps — read only from what was logged.

## Operating context

- **Phone-first, mid-workout.** The primary surface is a phone in one hand
  between sets: short attention windows, sweaty thumb targets, a rest timer
  counting down. The 44px tap-target token and fixed-UI clearances exist for
  this; desktop is a convenience, not the target.
- **Offline, always.** Static build with no backend (ADR 0001), guest-only
  boot (ADR 0002). After first load the network is optional — exercise media
  streams from a CDN and falls back gracefully; nothing else needs it.
- **Two homes.** The PWA in a browser, and Capacitor shells on iOS/Android
  whose native file mirror means backgrounding can never lose a session
  (ADR 0004). iOS Safari is a first-class citizen — its WebView can evict
  localStorage, which is why state is dual-written.
- **One-handed reading of numbers.** Weight, reps, rest seconds and effort
  are the app's payload; they use tabular numerals and are never decorative.

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

## Evidence quality

- Product purpose, audience, constraints: **HIGH** — README.md, GLOSSARY.md,
  docs/adr/, and docs/architecture.md agree with each other and with the code.
- Operating context: **HIGH** — tap-target and safe-area tokens, the
  dual-write storage protocol, and Capacitor shells are all in the code.
- Voice: **HIGH** — demonstrated by architecture-doc prose and existing copy
  conventions; spot-checked, not exhaustively audited.
- Which surface needs design attention first: **not yet recorded** — chosen
  per run, not durable truth.
