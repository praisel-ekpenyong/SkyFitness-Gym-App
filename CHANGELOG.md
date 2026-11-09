# Changelog

## Unreleased

The whole interface is rebuilt from scratch as a high-end training app, around the number you read
from the bench. Nothing about your data, the training logic or the features changed: routines,
progression, records and backups all read exactly as they did.

### The new interface

- 🏋️ **The set in front of you is a console.** One huge figure over two big keys and one Log key, with every other set folded to a single line. The first set is on the first screen now, not below a full-height animation.
- 🟢 **Your bar, drawn.** Barbell lifts show the plates for the set you are on, in competition colours and in words: "20 kg bar + 25 + 15 per side". A load no plates can make is stated, never rounded.
- ⏱️ **A rest clock you can read from the bench.** The largest thing on the phone while it runs, docked above the Log key, which now stays in view as you work down the sets.
- 🎯 **Focus mode.** A running workout takes the whole phone; the tab bar steps aside and a chevron minimizes it.
- 🩻 **X-ray exercise art.** The white plates become anatomical figures on black, with the target muscle still red.
- 📅 **Home leads with today.** The routine set poster-size beside the muscles it hits; a rest day shows what is still recovering; a new profile opens on the welcome.
- 🖥️ **Desktop gets a real layout.** A labelled sidebar and two-column screens, from the same code.
- 🔤 **One typeface.** Archivo, bundled with the app so it works offline and phones nowhere. New profiles start in the dark theme; a saved theme is kept, and the light theme was rebuilt too.

### Offline

- 📴 **Offline actually works.** A race in the service worker meant scripts and styles were never cached, so an offline reload opened a blank page. They are cached now, with a regression test.
- 🏟️ **Every screen is ready before you lose signal.** Screens are fetched on idle after the first paint, so a workout can start at a gym with no reception. It also makes tab switches instant.

Sky learns your name — optionally, and going no further than the device in your hand. Home greets
you with "Hi, {name}" instead of the app title, a small profile pill sits beside the settings gear
to show or change it in one tap, and Settings gains a Profile section for the same thing. The name
is capped at 24 characters, lives inside the ordinary state snapshot (so JSON exports carry it and
older backups pick it up through the default merge), and stays null until you set it — nobody is
asked who they are.

### History reads

- 🏆 **Best has one reading.** The exercise detail's Best now counts logged workouts and the stored working weight together, the same rule the session screen already follows — it could previously show a lower Best than the weight you had confirmed.
- 💪 **Deleted custom exercises keep counting.** Fatigue and retained strength now read an entry's logged muscle snapshot when the custom exercise it came from is gone, so deleting a custom no longer erases the training it did from the body map.

### Profile display name

- 👋 **Home greets you by name.** The header swaps "Sky" for "Hi, {name}", falling back to
  "Hi there" while no name is set.
- 💊 **Profile pill.** A tappable avatar-and-name pill next to the gear opens the editor; before a
  name exists it offers "Set name" instead.
- ⚙️ **Settings → Profile → Display name.** The same sheet, reachable from Settings, with clear
  and save actions.

### MIT License & Brand

- 📄 **MIT License.** Re-licensed Sky's own source code under the permissive MIT License. Third-party dataset and geometry notices maintained in `NOTICE.md`.
- 🏷️ **Sky identity.** Finalized brand consolidation and documentation across all README, PRODUCT, and DESIGN specifications.

### UI & Accessibility Hardening

- ♿ **Focus traps & ARIA dialogs.** Bottom sheets and modal dialogues now trap keyboard focus with `focusTrap`, set `aria-modal="true"`, and provide explicit accessible names and labels across forms, steppers, and interactive SVGs (BodyMap / Heatmap).
- 🎨 **WCAG AA contrast.** Elevated `--label-2` alpha ramp to 0.68 (dark) and 0.72 (light) ensuring ≥ 5.2:1 contrast ratio against card backgrounds. Added `--on-orange` contrast token and refined printable plan export palette.
- ⚡ **Compositor-accelerated animations.** Replaced layout-thrashing width transitions on progress bars and switches with GPU-composited `transform: scaleX` and `translateX`.
- 📐 **Visual distillation.** Removed heavy side-tab accent borders in favor of Apple HIG compliant hairline inset outlines and refined card groupings.

### Declarative Home Voice

- 📊 **Factual training volume.** Replaced gamified streak counters and flame icons on the Home bottom card with honest weekly training volume and progress, aligning with the declarative tone in `PRODUCT.md`.

### Architecture Modularization

- 🧩 **Domain sheet modules.** Extracted catalogue browsing (`sheets/catalogue.jsx`) and active workout session sheets (`sheets/session.jsx`) from the monolithic `sheets.jsx` hub.
- 🧱 **Named set and entry readings.** "Work set", "performed", "trained entry" and the per-entry muscle weights each have one named reading (`isWorkSet` / `isPerformed` / `workSets` / `doneWorkSets` / `hasWorkSet` / `muscleWeightsOf` / `lastTrainedByMuscle` / `lastWorkSetAt`), and every surface — body map, fatigue, strength rows, superset flow, session counters — applies the same precedence instead of carrying its own copy.
