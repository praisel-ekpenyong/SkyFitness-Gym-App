# Contributing to Sky

Sky is a personal, backend-free fork of [openGym](https://gitlab.com/DuarteSantos8/opengym). It is intentionally small, local-only, and dependency-light.

## Project layout

```
frontend/  React 19 + Vite app (src/views, src/components, src/store, src/lib). Builds to static files.
           android/ + ios/ are the Capacitor shells for the standalone mobile app (docs/MOBILE.md).
docs/      Architecture documentation, ADRs, and agent guides.
scripts/   Exercise dataset tools and property tests.
assets/    App screenshots and banner art.
```

## Running for development

No Docker, no backend, and no environment files required:

```bash
# Start local dev server
cd frontend
npm install
npm run dev

# Run Vitest test suite
npm test

# Run production static build
npm run build
```

## Guidelines

- **Keep it dependency-light.** The frontend uses React 19 + React Router + Zustand and nothing else. New runtime dependencies are avoided.
- **Match the style.** Small components, clear names, comments only where the "why" isn't obvious. State lives in the Zustand store (`src/store/useStore.js`); pure helpers live in `src/lib/`.
- **All persistence goes through `src/lib/storage.js`.** State is mirrored between `localStorage` and `IndexedDB` with timestamp-based reconciliation at boot.
- **Test the flow you touched.** Click through the affected screens (and workout flow) in a browser before finishing changes.
- **Training logic gets a unit test.** Anything deciding what you lift next, calculating progression, estimating 1RM, computing recovery fatigue, or parsing imported workouts belongs in a pure helper in `src/lib/` with Vitest tests beside it (`npm test`).

## Provenance & License

Sky is maintained as a personal fork and does not take public contributions.

- All code in Sky inherits the **[GNU AGPL v3.0](LICENSE)** from upstream openGym.
- Third-party exercise dataset and media licenses are documented in [NOTICE.md](NOTICE.md).
