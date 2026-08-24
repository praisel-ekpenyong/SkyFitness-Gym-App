# 02 — Local-first media resolution with CDN fallback

**Type:** task
**Status:** open
**Blocked by:** 01

## Question

How should `frontend/src/lib/exercises.js` (`imgSrc` and `gifSrc`) and UI components resolve local static media paths (`/media/images/` and `/media/videos/`) by default, while supporting `VITE_IMG_BASE`/`VITE_GIF_BASE` overrides and providing a reliable fallback to the pinned jsDelivr CDN if a local asset is missing or fails to load?
