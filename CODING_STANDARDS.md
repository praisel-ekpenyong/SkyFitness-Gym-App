# SkyFitness Coding Standards & Pit of Success

Authoritative engineering conventions and architectural rules for SkyFitness. Reviewed and enforced during code reviews.

---

## 1. Domain Logic & Purity (`src/lib/`)

- **Pure Training Logic**: All progression algorithms, 1RM estimations, fatigue/recovery calculations, muscle load derivations, and data import matchers live in pure helper modules under `frontend/src/lib/`.
- **Zero Framework Couplings**: Modules in `src/lib/` must never import React, React Router, DOM APIs, or Zustand stores directly. They accept inputs and return calculated outputs.
- **Adjacent Test Files**: Every pure module in `src/lib/` must have an adjacent Vitest test file (`*.test.js`) with high test coverage, covering edge cases, zero-values, and boundary transitions.
- **Immutable Inputs**: Domain calculations must never mutate input objects or arrays.

---

## 2. Function Signatures & Parameter Discipline

- **Single Canonical Signatures**: Every public function must expose a single, unambiguous signature. Avoid runtime signature sniffing, inverted parameter order fallbacks, or arguments with multi-type names (e.g. `S_or_entry`).
- **No Primitive Overloading**: Do not reuse parameters for unrelated domain concepts (e.g. passing a unit enum `'kg'` into a `formula` parameter). Use distinct, optional named parameters or typed options objects.
- **Defensive Purity**: Guard against null or missing properties defensively without cloning entire application state trees inside leaf functions.

---

## 3. Persistence & Data Integrity

- **Dual-Write Protocol (ADR 0004)**: All state writes must pass through `src/lib/storage.js`, maintaining synchronization between `localStorage` and `IndexedDB`.
- **Read-Time Unit Normalization (ADR 0017)**: Historical workout logs are immutable. Do not run destructive data migrations across historical sessions when the user toggles `S.unit` ('kg' <-> 'lb'). All metric evaluations (1RM records, trend curves, fatigue stimulus) normalize logged set weights against active `S.unit` on read.
- **Static-Only Architecture (ADR 0001)**: The client is completely static; no backend servers, database APIs, or external network services.

---

## 4. UI Architecture & Accessibility (WCAG 2.1 AA)

- **Interactive Maps & SVG Graphics**: Any interactive SVG diagram (such as `BodyMap`) must provide accessible text via `getA11yLabel(slug, level)`, announcing the entity name, training state, and quantified metrics (e.g. `"Chest, 4.0 effective sets"`), not just raw visual shapes.
- **Dynamic Live Regions**: Contextual inspector cards and dynamic summaries revealed on user interaction must include `role="status"` and `aria-live="polite"` so assistive technologies announce updates.
- **Keyboard Navigation**: Any clickable element (filter chips, missed muscle banners, list items) that functions as a button must carry `role="button"`, `tabIndex={0}`, and handle `Enter` and `Space` keydown events.
- **No Middle-Man Re-exports**: Components must be imported directly from their defining module rather than passed through intermediary view or sheet modules.

---

## 5. Domain Terminology (`GLOSSARY.md`)

Code, user-facing copy, and documentation must adhere to the canonical terms in [`GLOSSARY.md`](GLOSSARY.md):
- **Use**: *Session muscle distribution* | **Avoid**: *muscle recap*, *workout split*
- **Use**: *Effective sets* (Primary 1.0, Secondary 0.4) | **Avoid**: *total sets*, *raw set count*
- **Use**: *Estimated 1RM* | **Avoid**: *e1RM*, *predicted max*
- **Use**: *Fatigue* | **Avoid**: *freshness*, *readiness score*
