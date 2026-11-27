# Sheet-history Back decisions live behind one attach seam

Status: Accepted, 2026-11-27.

## Context

Back from a sheet closes the top sheet and leaves browser history aligned. That one rule was split across three places: the pure reducer in `lib/sheet-history.js`, the `history` and `popstate` effects in `Modals.jsx`, and `decideBack` in `platform/back.js`. Three tickets (#209, #241, #242) rebuilt that seam. The purity rule forbids `lib/` from importing `store/` or `platform/`, or touching `window`, `history` and `popstate`; an interpreter in `store/` that imported `platform/back.js` would close the `useUI` → `back` → `useUI` cycle already recorded in [0032](0032-the-active-workout.md).

## Decision

One deep Module owns sheet-versus-history state and effects behind a single Interface: `createSheetHistory(host) → dispose`. Callers inject a sheets Adapter, a browser-history Adapter and a hardware-Back Adapter, and the Back handle is installed at attach time. No effect, tombstone, pending-pop count or decision string crosses the Seam. The pure core stays in `lib/sheet-history.js`; the interpreter lives in a platform module, so the purity rule holds and no store-to-platform import exists. `platform/back.js` keeps exit-arming and exit only. Escape, swipe-down and backdrop dismissal stay outside the Module and reach it through the sheets subscription. Two real Adapters — browser popstate and hardware Back — justify the Seam; a plugin registry would not.

## Considered Options

- A plugin protocol with registrable reducers, sources, effect handlers and sheet policies was rejected: its Interface approached the complexity it hid, and effect handlers registered in the view recreated the split we were removing.
- A ready-made instance with a zero-argument Back call was rejected as the Interface: two setup verbs remained and a missed registration would desynchronise history.

## Consequences

- Callers learn one verb: attach once, dispose once.
- State is committed before effects run, because closing a sheet re-enters the sheets subscription synchronously.
- The happy-dom history test becomes the Interface test; assertions on effect arrays and on `decideBack` return strings go with the old Interface rather than being layered over the new one.
- A locked sheet consumes the Back press without closing; the hardware Adapter must not treat that as a cue to arm exit.
