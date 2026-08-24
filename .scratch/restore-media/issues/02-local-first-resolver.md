# 02 — Local-first media resolution with CDN fallback

**Type:** task
**Status:** resolved
**Blocked by:** 01

## Question

How should `frontend/src/lib/exercises.js` (`imgSrc` and `gifSrc`) and UI components resolve local static media paths (`/media/images/` and `/media/videos/`) by default, while supporting `VITE_IMG_BASE`/`VITE_GIF_BASE` overrides and providing a reliable fallback to the pinned jsDelivr CDN if a local asset is missing or fails to load?

## Answer

Implemented local-first media resolution with automatic CDN fallback:

1. **`frontend/src/lib/exercises.js`**:
   - `imgSrc(ex)` and `gifSrc(ex)` resolve locally by default (`media/images/<filename>.jpg` and `media/videos/<filename>.gif`), compatible with static web serving, relative base pathing (`./`), and standalone mobile shells (Capacitor).
   - Supports `VITE_IMG_BASE` and `VITE_GIF_BASE` environment overrides for custom mirrors/CDNs.
   - Exports pinned CDN constants (`CDN_IMG_BASE`, `CDN_GIF_BASE`, `PINNED_DATASET_COMMIT`) and fallback helper functions (`cdnImgSrc(ex)`, `cdnGifSrc(ex)`).
2. **`frontend/src/components/Media.jsx`**:
   - `<Media />` and `<Thumb />` attach `onError` handlers to their underlying `<img>` tags.
   - When a local asset is missing or fails to load, `onError` gracefully fails over to `cdnGifSrc(ex)` or `cdnImgSrc(ex)` without infinite reload loops.
3. **Tests**:
   - Unit tests in `frontend/src/lib/exercises.test.js` verify local resolution and CDN helper paths.
   - Component unit tests in `frontend/src/components/Media.test.jsx` verify local rendering, tap toggling, and CDN failover on `onError` events.

