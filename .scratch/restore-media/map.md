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

## Not yet specified

- Service worker / PWA runtime caching strategies for 140MB of binary GIFs/images in mobile browser storage quotas.
- Capacitor Android native packaging inclusion vs separate download pack for APK builds.

## Out of scope

- Committing binary media (~140MB) directly into Git repository history.
- Relicensing third-party media or changing third-party copyright attribution in NOTICE.md.
- Re-introducing a backend or server container to proxy media files.
