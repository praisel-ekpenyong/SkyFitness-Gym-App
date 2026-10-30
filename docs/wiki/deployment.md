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

- **2026-10-30 (Commit `d87a246`):** Full test suite (977 tests), fatigue probe (108,000 comparisons), static bundle build (523ms), and Playwright preview (6 routes) passed. Deployed via Netlify CLI (`npx netlify deploy --dir frontend/dist --prod`). Deploy ID: `6ae45d3866037fb8a4f8a95f`. Unique Deploy URL: `https://6ae45d3866037fb8a4f8a95f--skyfitness-app.netlify.app`. Production URL: `https://skyfitness-app.netlify.app`. Live smoke test confirmed HTTP 200, clean app shell mount, and valid CSP headers.
- **2026-10-29 (Commit `c8f3283`):** Full test suite (928 tests), fatigue probe (108,000 comparisons), static bundle build (523ms), and Playwright preview (6 routes) passed. Deployed via Netlify CLI (`npx netlify deploy --dir frontend/dist --prod`). Deploy ID: `6ae324942489bbfcd33c46e6`. Unique Deploy URL: `https://6ae324942489bbfcd33c46e6--skyfitness-app.netlify.app`. Production URL: `https://skyfitness-app.netlify.app`. Live smoke test confirmed HTTP 200, clean app shell mount, and valid CSP headers.
- **2026-10-28 (Commit `aaa1e29`):** Full test suite (895 tests), fatigue probe (108,000 comparisons), static bundle build (537ms), and Playwright preview (6 routes) passed. Deployed via Netlify CLI (`npx netlify deploy --dir frontend/dist --prod`). Deploy ID: `6ae2655d7a1458f78be7876b`. Unique Deploy URL: `https://6ae2655d7a1458f78be7876b--skyfitness-app.netlify.app`. Production URL: `https://skyfitness-app.netlify.app`. Live smoke test confirmed HTTP 200, clean app shell mount, and valid CSP headers.
- **2026-10-28 (Commit `32f391f`):** Full test suite, fatigue probe, and Playwright preview passed. Deployed via Netlify CLI (`npx netlify deploy --dir frontend/dist --prod`). Deploy ID: `6ae1fba526036da1accf8409`. Unique Deploy URL: `https://6ae1fba526036da1accf8409--skyfitness-app.netlify.app`. Live smoke test confirmed HTTP 200, clean `#root` mount, and valid CSP headers.

## Related pages

- [Decision log](decisions.md)
- [Process notes](process.md)
