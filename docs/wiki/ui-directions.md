# UI directions

Dated record of the interface directions tried. The system itself is documented in `DESIGN.md`; this page
records what was decided, why, and what was found.

## Iron (2026-11-09)

- Requested by the owner: "rebuild the entire ui from scratch to be more like a high end gym app".
- Built at `ui/iron@1ec0dc4`, preceded by the offline fix at `8c1d054`. Neither was merged to `master` as of
  those commits. The owner saw it running that day in a seeded desktop window on port 5173.
- The idea, as of `1ec0dc4`: the app icon is a loaded bar, so every set draws the lifter's own bar
  (`components/Barbell.jsx`, `lib/plates.js`). The open set is one console; other sets fold to a line.
- Style dealt from the taste skill's `true-black-flat` (seed 1039594653). The kit's dealt lime `#c6f24e` was
  replaced by the app icon's own `#a3e635`, sampled from `public/icon-512.png`.
- Verified that day with a Playwright audit of the production build under the real CSP, at four widths in both
  themes. No real phone and no Capacitor build was tested.
- The taste skill was replaced mid-session by a marketing-site kit, so its `inspect.mjs` could not be run on the
  final build.

### Found while verifying

- On 2026-11-09, an offline reload opened a blank page: `public/sw.js` cloned responses after handing them to
  the page, so no script or style was ever cached. Fixed at `8c1d054`, with a test that fails on the old worker.
- On 2026-11-09, lazy screens never opened online were missing offline, including Workout. As of `1ec0dc4`,
  `main.jsx` fetches them on idle after first paint.
- As of `1ec0dc4`, exercise art from the CDN is not cached by the service worker unless it was bundled, so it
  shows an empty tile offline. Not addressed.

### Outcome
- On 2026-11-09 a review of the built app (tests, the review harness at four widths in both themes, browser
  probes) found one core-flow bug: leaving a superset opened the next exercise scrolled past its own name. It also
  found the session segments 4px under the 44px rule, records in two colours, and the first Log key below the fold
  on phones shorter than ~700px. None of it was structural.
- The owner chose Iron as the product, in its own repository (`SkyFitness-Iron`), with the old interface frozen as
  a fallback. See the [decision log](decisions.md) and `.scratch/iron-launch/spec.md`.

## Plate (prototype, opened 2026-11-09)

- Spec: `.scratch/ui-prototype/spec.md`. Ticket: `.scratch/ui-prototype/issues/01-plate-core-path.md`.
- Worktree `.worktrees/proto-plate`, branch `proto/plate` from `ui/iron@1ec0dc4`. Throwaway unless the owner
  decides otherwise.
- The question: mid-workout, does a one-screen thumb flow with a bold colour identity beat Iron's scrolling page?
- On 2026-11-09 the implementer reported the core path built and driven Home → finish at 390x844 with no
  page errors, via a build flag (`vite.plate.config.js`, `npm run plate` on 5174). Its findings: the plate
  colour carries strongly on barbell days but only 2 of 6 lifts on the demo Push Day load plates, so most
  of that session sits on the neutral iron field; the one-screen set and the draining rest felt more
  focused than Iron's scrolling page. Known gaps: a dead band mid set screen, an empty weigh-in middle,
  two fixes never run, no short-screen, desktop, timed or cardio checks, `npm test` never run.
- The owner saw Home only, live on 5174, at 17:49 that day.
- At 17:52 the same day, the `proto-plate` worktree, the `proto/plate` branch and `.scratch/ui-prototype/`
  were removed, by neither the chief of staff nor its agents. Who removed them was not established. The
  work was uncommitted, so it survives only as the implementer's copy in the session scratchpad
  (`scratchpad/plate/snapshot/`, with `RESTORE.txt`), which is deleted when that session ends.
- ~~Outcome: not decided. Restoring it waits on the owner.~~ Superseded the same day, below.
- On 2026-11-09 the owner chose to leave Plate deleted. The scratchpad copy was removed on their instruction,
  so no copy of the source remains. The window opener and its profile in the scratchpad had already gone by
  then, and the Plate window had closed. The owner did not say who removed the worktree, and this page does
  not assume it.
- What carries forward, if the direction is revisited: the plate colour only appears on barbell lifts, so a
  plate-coloured identity is absent for most of a typical session; the one-screen set and full-screen rest
  were judged more focused than Iron's scrolling page (implementer's view, not the owner's).

## See also

- [Decision log](decisions.md)
- [Process notes](process.md)
