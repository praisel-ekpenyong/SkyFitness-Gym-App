# 03 — PWA, build, and Git integration

**Type:** task
**Status:** resolved
**Blocked by:** 02

## Question

How should `.gitignore`, `vite.config.js`, and package scripts (`npm run build`, `npm run dev`) be configured so that `frontend/public/media/` is excluded from git commits, properly bundled into production `dist/` builds when present, and safely handled without breaking PWA precaching asset size limits?

## Answer

1. **`.gitignore`**: `frontend/public/media/` stays ignored (verified with `git check-ignore` against nested `images/` and `videos/` paths). The stale docker-era entries (`media/img/`, `media/gif/`, "fetched on first docker compose up" comment) were deleted along with their cause, the superseded bash-only `scripts/fetch-media.sh` (ticket 01's cross-platform `fetch-media.mjs` replaced it; nothing references it outside CHANGELOG history).
2. **`vite.config.js`**: `base: './'` kept (host-agnostic relative output, per the sky spec). The server-era dev proxies (`/api`, `/img`, `/gif`) are gone — no code calls them anymore; in dev the local media under `public/media/` is served by Vite itself at the origin root. A small `sky-media-notice` plugin logs at build start whether local media will be bundled or the CDN fallback is active, so "bundled when present" is observable and a media-less CI build can't go silently wrong.
3. **Package scripts**: no change needed — this is the decision, not an omission. `vite build` copies `public/` verbatim into `dist/`, so `npm run media:fetch && npm run build` bundles media and a bare `npm run build` still works (CDN fallback per asset via ticket 02's resolver). `npm run dev` needs no proxy for the same reason.
4. **PWA safety**: Sky's service worker (`public/sw.js`) is hand-rolled *runtime* caching — there is no workbox precache manifest, so no build-time `maximumFileSizeToCacheInBytes` limit exists to break, deliberately: precaching 140 MB of media would be both a quota hazard and a build-order dependency. The one integration gap was fixed TDD-style (seam: `src/sw.test.js`, which executes the real `sw.js`): the fetch handler classified media by upstream's dead `/img/` + `/gif/` path markers, so local files got network-first shell treatment. It now matches `/media/images/` and `/media/videos/` (the shapes ticket 02's resolver emits), keeping cache-first parity for installed PWAs; cross-origin CDN fallback requests remain untouched. Runtime caching strategy/quota policy for the full 140 MB stays open per the map's "Not yet specified".

Verified: builds succeed both without media (no `dist/media`, CDN notice) and with stub media (verbatim copy-through to `dist/media/images|videos`); full suite green after the change.
