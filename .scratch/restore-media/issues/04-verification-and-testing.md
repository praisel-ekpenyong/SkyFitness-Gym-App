# 04 — Verification and testing

**Type:** task
**Status:** resolved
**Blocked by:** 03

## Question

What unit and integration tests (in `exercises.test.js` and view smoke tests) are needed to verify that `imgSrc` and `gifSrc` produce correct relative and CDN paths, that sample images/GIFs resolve cleanly in Vite dev and build modes, and that all 322+ existing test suites pass?

## Answer

Established comprehensive test coverage across unit, component, view, build, and runtime caching layers:

1. **Unit tests in `frontend/src/lib/exercises.test.js`**:
   - Verified local path resolution (`media/images/<filename>.jpg` and `media/videos/<filename>.gif`) for `imgSrc` and `gifSrc`.
   - Verified CDN path generation against the pinned commit hash (`7455efae41b330c265e7cd4b78dfa848e7ce5ebd`) for `cdnImgSrc` and `cdnGifSrc`.
   - Verified `mediaSrc(ex, { playing, fallback })` for all 4 state permutations (playing/still × local/fallback).
   - Validated dataset integrity for all 1,324 exercises in `EXDB`: verified every item has valid IDs, body parts, targets, and correctly matching `.jpg` / `.gif` filenames.
   - Verified `smOf` non-mutating secondary muscle enrichment, `registerCustom` lifecycle in `EXIDX`, cardio/bodyweight checks, and fallback placeholders for unknown IDs (`exOr`).

2. **Component & View smoke tests**:
   - `frontend/src/components/Media.test.jsx`: Verified `<Thumb />` and `<Media />` render local asset paths by default, trigger CDN fallback on `onError` events, maintain independent GIF vs still failure states, toggle minimize mode, and reset states when exercise props change.
   - `frontend/src/views/Library.test.jsx`: Smoke tested `Library` view rendering 40 initial items with `<Thumb />`, verified DOM-level CDN fallback on error, and tested body-part chip filtering and keyword search.
   - `frontend/src/sw.test.js`: Verified runtime service worker cache-first routing for `/media/images/` and `/media/videos/`.
   - `scripts/fetch-media.test.js`: Verified 7 tests covering tar header parsing, stream extraction, dry-run mode, and network error handling.

3. **Build and Dev Mode verification**:
   - Verified `npm run build` succeeds in media-less mode (logging CDN streaming notice) producing standard dist artifacts.
   - Verified `npm run build` with sample local media correctly bundles files into `dist/media/images/` and `dist/media/videos/` with the bundling notice.
   - Full Vitest suite passes cleanly with 28 test files and 356 passing tests.

