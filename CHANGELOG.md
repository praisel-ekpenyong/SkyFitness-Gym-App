# Changelog

## Unreleased

Sky learns your name — optionally, and going no further than the device in your hand. Home greets
you with "Hi, {name}" instead of the app title, a small profile pill sits beside the settings gear
to show or change it in one tap, and Settings gains a Profile section for the same thing. The name
is capped at 24 characters, lives inside the ordinary state snapshot (so JSON exports carry it and
older backups pick it up through the default merge), and stays null until you set it — nobody is
asked who they are.

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
