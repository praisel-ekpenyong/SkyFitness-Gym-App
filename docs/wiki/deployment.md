# Deployments and hosting

Historical records of deployment configurations, edge environments, and production releases for Sky.

## Architecture and targets

As of commit `32f391f` (2026-10-28), Sky is hosted as a pure static progressive web application with zero backend dependencies, using relative asset paths (`base: './'`).

- **Netlify Site:** `skyfitness-app` (Site ID `51d8627c-c73a-4802-be54-4fce0937cb28`).
- **Production URL:** [https://skyfitness-app.netlify.app](https://skyfitness-app.netlify.app).
- **Configuration Twin:** Top-level `netlify.toml` mirrors `frontend/public/_headers` (Cloudflare Pages policy) so security policies and caching headers remain identical across hosts.

## Release verification gates

On 2026-10-28, the production release pipeline established four mandatory pre-flight verification gates prior to edge promotion:

1. **Unit and regression suite:** `cd frontend && npm test` (64 files, 888 tests as of `32f391f`).
2. **Fatigue monotonicity probe:** `cd frontend && npm run test:fatigue-probe` (108,000 comparisons verifying fatigue never increases across rest intervals, plus randomized deletion checks).
3. **Static bundle compilation:** `cd frontend && npm run build` (emits hashed chunks into `frontend/dist/`).
4. **Headless browser preview:** `cd frontend && npm run test:preview` (Playwright automated navigation across `#/home`, `#/plan`, `#/stats`, `#/library`, `#/settings`, and `#/workout`, verifying DOM mounting and zero console errors).

## Edge policies and headers

As verified on Netlify Edge on 2026-10-28:

- **CSP:** `default-src 'self'; img-src 'self' https://cdn.jsdelivr.net; media-src 'self' https://cdn.jsdelivr.net`
- **Cache control for app shell:** `Cache-Control: no-cache, no-store, must-revalidate` for `/index.html`, `/sw.js`, and `/manifest.json`. This guarantees lifters immediately receive code updates on refresh rather than getting pinned to stale service worker shells.
- **Cache control for immutable chunks:** `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`.
- **SPA Fallback:** `/*` rewrites to `/index.html` with status 200 for client-side routing.

## Deployment history

- **2026-10-30 (Commit `983ba9e`):** Full test suite (72 test files, 1,051 tests), fatigue probe (108,000 comparisons + 14,858 randomized deletion checks), static bundle build (501ms), and Playwright preview (6 routes) passed. Deployed via Netlify CLI (`npx netlify deploy --dir frontend/dist --prod`). Deploy ID: `6ae4a460d786b64c2a8fc288`. Unique Deploy URL: `https://6ae4a460d786b64c2a8fc288--skyfitness-app.netlify.app`. Production URL: `https://skyfitness-app.netlify.app`. Live smoke test confirmed HTTP 200, clean app shell mount, valid CSP headers, and immutable asset cache headers (`public, max-age=31536000, immutable`).
- **2026-10-30 (Commit `d87a246`):** Full test suite (977 tests), fatigue probe (108,000 comparisons), static bundle build (523ms), and Playwright preview (6 routes) passed. Deployed via Netlify CLI (`npx netlify deploy --dir frontend/dist --prod`). Deploy ID: `6ae45d3866037fb8a4f8a95f`. Unique Deploy URL: `https://6ae45d3866037fb8a4f8a95f--skyfitness-app.netlify.app`. Production URL: `https://skyfitness-app.netlify.app`. Live smoke test confirmed HTTP 200, clean app shell mount, and valid CSP headers.
- **2026-10-29 (Commit `c8f3283`):** Full test suite (928 tests), fatigue probe (108,000 comparisons), static bundle build (523ms), and Playwright preview (6 routes) passed. Deployed via Netlify CLI (`npx netlify deploy --dir frontend/dist --prod`). Deploy ID: `6ae324942489bbfcd33c46e6`. Unique Deploy URL: `https://6ae324942489bbfcd33c46e6--skyfitness-app.netlify.app`. Production URL: `https://skyfitness-app.netlify.app`. Live smoke test confirmed HTTP 200, clean app shell mount, and valid CSP headers.
- **2026-10-28 (Commit `aaa1e29`):** Full test suite (895 tests), fatigue probe (108,000 comparisons), static bundle build (537ms), and Playwright preview (6 routes) passed. Deployed via Netlify CLI (`npx netlify deploy --dir frontend/dist --prod`). Deploy ID: `6ae2655d7a1458f78be7876b`. Unique Deploy URL: `https://6ae2655d7a1458f78be7876b--skyfitness-app.netlify.app`. Production URL: `https://skyfitness-app.netlify.app`. Live smoke test confirmed HTTP 200, clean app shell mount, and valid CSP headers.
- **2026-10-28 (Commit `32f391f`):** Full test suite, fatigue probe, and Playwright preview passed. Deployed via Netlify CLI (`npx netlify deploy --dir frontend/dist --prod`). Deploy ID: `6ae1fba526036da1accf8409`. Unique Deploy URL: `https://6ae1fba526036da1accf8409--skyfitness-app.netlify.app`. Live smoke test confirmed HTTP 200, clean `#root` mount, and valid CSP headers.

## Related pages

- [Decision log](decisions.md)
- [Process notes](process.md)

## Cloudflare Pages (2026-11-15)

- **2026-11-15 (Commit `a924ee4`):** Iron uploaded to the Cloudflare Pages project `skyfitness` with Wrangler, on the production branch name `master`. Deployment ID `0ab3c7f1-a6c5-4493-94d1-5fd1a134b5b1`. Unique URL `https://0ab3c7f1.skyfitness.pages.dev`. Production URL `https://skyfitness.pages.dev`. Live check: HTTP 200, `theme-color` `#0a0a09`, CSP `default-src 'self'; img-src 'self' https://cdn.jsdelivr.net; media-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net`. Rollback target: previous production deployment `b9f4e5f1-d62b-4889-b82e-f5d45e8f5d0f` (`master@e28feb6`). The Cloudflare production branch setting was still `master` after this upload. Gates recorded on the ticket `.scratch/iron-launch/issues/05-deploy-pages.md`.

## Cloudflare Pages (observed 2026-11-14)

- On 2026-11-14 a release-check agent found that skyfitness.pages.dev is built by Cloudflare's own Git integration
  from GitHub (remote `github`), with no `wrangler.toml`. As of `main@1cc54a3`, `.github/workflows/test.yml` only
  runs tests. Source: `.scratch/iron-launch/issues/05-deploy-pages.md` (comments of 2026-11-10).
- Iron ships on remote branch `iron`. As of 2026-11-14 the Cloudflare production branch was still `master` (that
  ticket is `ready-for-human`), so `git push github main:iron` updates only the iron.skyfitness.pages.dev preview.
- Nothing deploys without a push from this checkout. The Netlify CLI section above covers the frozen old app's
  host only.
  - *Superseded 2026-11-15:* the production address now serves the direct upload recorded above. A Git push to
    GitHub `master` can still build over it, because the production branch setting was left as `master`.
