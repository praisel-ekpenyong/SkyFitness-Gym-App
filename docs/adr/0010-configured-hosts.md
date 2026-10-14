# Configured hosts; builds stay host-agnostic

**Status:** accepted — supersedes ADR-0005 (hosting deferred)

**Context:** ADR-0005 deferred choosing a host and kept the build portable; deploy configuration for two hosts now exists, so the deferral is resolved rather than re-litigated: Sky is served as a static build from `frontend/dist` on Cloudflare Pages (SPA fallback plus cache and security headers via `frontend/public/_headers` and `frontend/public/_redirects`) and on Netlify (same build, fallback, and headers via the repo-root `netlify.toml`, which names its canonical twin), while the bundle itself stays host-agnostic through a document-relative base (`base: './'`), a document-relative manifest link, and environment overrides validated in one seam (`frontend/src/lib/env.js`), so adding or dropping a host remains a config change, not an architecture change.
