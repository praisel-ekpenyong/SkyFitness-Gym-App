# Effort: Restore Exercise Media

## Destination

Restore all 1,324 exercise thumbnails (JPG) and animated demos (GIF) to work locally and offline in Sky via an automated cross-platform Node fetch script, bundling into `frontend/public/media/` with local-first resolution and CDN fallback in `exercises.js`.

## Notes

- Domain: Static frontend exercise media asset handling and offline bundling.
- Repository: `opengym-main` (Sky fork).
- Skills: `codebase-design`, `tdd`.
- Standing preferences: Pure Node/JavaScript scripts (cross-platform Windows/macOS/Linux, no bash/curl dependencies), no binary files committed to Git (`.gitignore` `frontend/public/media/`), local-first with graceful CDN fallback.

## Decisions so far

- **Cross-platform media fetch script**: Implemented `scripts/fetch-media.mjs` using pure Node standard libraries (streaming gunzip + tar parser) to unpack 1,324 JPG images into `frontend/public/media/images/` and 1,324 GIFs into `frontend/public/media/videos/` from the pinned dataset commit without OS-specific dependencies. Callable via `npm run media:fetch` from `frontend/`. See [01-media-fetch-script.md](issues/01-media-fetch-script.md).
- **Local-first media resolution & CDN fallback**: `exercises.js` (`imgSrc` and `gifSrc`) defaults to relative paths (`media/images/` and `media/videos/`) with `VITE_IMG_BASE`/`VITE_GIF_BASE` override support and exported CDN helpers (`cdnImgSrc`, `cdnGifSrc`). `<Media />` and `<Thumb />` in `Media.jsx` catch image loading errors via `onError` and seamlessly fall back to the pinned jsDelivr CDN. See [02-local-first-resolver.md](issues/02-local-first-resolver.md).
- **PWA, build, and Git integration**: `frontend/public/media/` stays gitignored (stale docker-era ignore entries and superseded `fetch-media.sh` deleted); server-era dev proxies removed from `vite.config.js`, which now logs whether media will bundle; package scripts unchanged (`vite build` copies `public/` verbatim). The hand-rolled runtime-caching SW means no precache size limit exists to break; its fetch handler now routes `/media/images/|videos/` cache-first (TDD'd in `sw.test.js`). See [03-pwa-and-build-integration.md](issues/03-pwa-and-build-integration.md).
- **Verification and testing pass**: Full coverage across unit tests (`exercises.test.js` validating all 1,324 dataset entries and resolver permutations), component tests (`Media.test.jsx`), view smoke tests (`Library.test.jsx`), service worker tests (`sw.test.js`), fetch script tests (`scripts/fetch-media.test.js`), and build bundling verification across dev, media-less, and media-present Vite builds with all 28 test suites (356 tests) passing cleanly. See [04-verification-and-testing.md](issues/04-verification-and-testing.md).

## Not yet specified

- Service worker / PWA runtime caching strategies for 140MB of binary GIFs/images in mobile browser storage quotas.
- Capacitor Android native packaging inclusion vs separate download pack for APK builds.

## Out of scope

- Committing binary media (~140MB) directly into Git repository history.
- Relicensing third-party media or changing third-party copyright attribution in NOTICE.md.
- Re-introducing a backend or server container to proxy media files.
