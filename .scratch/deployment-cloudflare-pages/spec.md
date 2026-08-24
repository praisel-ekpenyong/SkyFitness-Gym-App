# Spec: Cloudflare Pages Deployment for Sky

Status: ready-for-agent

## Problem Statement

The user wants to deploy Sky as a personal, 100% free, backend-free web application (Progressive Web App) accessible via a clean, dedicated domain (`skyfitness.pages.dev`) that does not reveal their personal GitHub account name. The deployment must preserve Sky's privacy and local-first architecture (where all profile data, workouts, weigh-ins, and settings remain strictly on the device in browser storage), support continuous automated deployment on repository push, optimize caching for the application shell and service worker, and maintain on-demand streaming for the exercise demo catalogue without blowing up build sizes.

## Solution

Deploy the static build of the frontend to Cloudflare Pages connected directly to the repository's `main` branch. Provide platform configuration for SPA routing fallbacks and HTTP response caching headers (preventing stale service worker registration while aggressively caching immutable static assets). Keep exercise animations streaming on-demand from the CDN so builds remain lightweight, and provide comprehensive documentation in the self-hosting guide for configuring the Cloudflare Pages build settings and custom project name.

## User Stories

1. As a lifter, I want to access my workout tracker via a clean web URL (`https://skyfitness.pages.dev`), so that I can easily open and use the application across any of my devices.
2. As a privacy-conscious user, I want the hosted URL to not expose my personal GitHub username, so that my repository ownership and personal profile remain private.
3. As a lifter on a mobile phone, I want to install Sky as a Progressive Web App (PWA) directly from Safari or Chrome over HTTPS, so that it runs standalone without browser chrome.
4. As a lifter in the middle of a set, I want the screen to stay awake while training, so that I do not have to unlock my phone between every set.
5. As a lifter, I want all my training logs, routines, and body-weight entries to remain strictly on my device's local storage and IndexedDB, so that no sensitive health data is ever transmitted to a remote server.
6. As a maintainer, I want the deployment to be 100% free with no unexpected bandwidth or build-minute charges, so that hosting is zero-cost and sustainable indefinitely.
7. As a maintainer, I want pushing commits to `main` to trigger automated builds and immediate updates on the live site, so that I do not need to manually build and upload assets.
8. As a lifter, I want initial page loads to be fast and lightweight (< 2 MB), so that the application opens instantly even on mobile data.
9. As a lifter browsing new exercises in the catalogue, I want demonstration animations to stream on demand and cache locally in the service worker, so that I can view demos without bloating the initial download bundle.
10. As a lifter using deep links or refreshing on different views, I want the client-side router to resolve smoothly without 404 errors, so that navigation is seamless across the entire application.
11. As a lifter returning after an application update, I want my browser to fetch the newest application shell without being stuck on a stale service worker cache, so that new features and fixes apply promptly.
12. As a maintainer, I want static assets (hashed JS, CSS, fonts) to be served with long-term immutable caching headers, so that repeat visits and tab transitions are instantaneous.
13. As a self-hoster or future maintainer, I want clear, step-by-step instructions in the documentation for configuring build output and environment variables on Cloudflare Pages, so that anyone with repository access can reproduce or migrate the deployment.
14. As a maintainer, I want broken code or failing progression logic to fail the automated test suite before reaching production, so that lifters never receive corrupted training targets.

## Implementation Decisions

1. **Static Build Packaging**: Sky's frontend will build via the existing Vite pipeline with relative base paths (`base: './'`), producing a standalone static artifact in `dist/`.
2. **Hosting Provider & Subdomain Target**: The deployment targets Cloudflare Pages on the free tier, configured with the project name `skyfitness` to produce the public domain `skyfitness.pages.dev`.
3. **Deployment Integration Method**: Git-native integration linking the repository's `main` branch directly to Cloudflare Pages.
4. **Build Pipeline Configuration**:
   - Build command: `npm run build`
   - Root directory: `frontend`
   - Output directory: `dist`
   - Runtime environment: Node.js 22 (`NODE_VERSION: 22`)
5. **Asset & Media Streaming Strategy**: Exercise animations and thumbnails stream on demand from the CDN dataset; the build pipeline does not bundle the ~140 MB media directory into the deployment artifact, relying on runtime service worker caching.
6. **HTTP Response Header Policy**:
   - `index.html`, `sw.js`, and `manifest.json`: Configured with `Cache-Control: no-cache, no-store, must-revalidate` to guarantee instant pickup of application updates and icon/manifest changes.
   - Hashed static assets (`assets/*`): Configured with `Cache-Control: public, max-age=31536000, immutable` for maximum edge and browser caching.
   - Security headers: Standard security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`) applied to all routes.
7. **Single-Page Application Fallback**: Platform-level rewrite rule mapping all subpath requests to `/index.html` with an HTTP 200 status.
8. **Documentation Alignment**: The self-hosting guide will be updated to feature Cloudflare Pages with explicit dashboard configuration parameters alongside existing options.

## Testing Decisions

- **What makes a good test**: Tests should verify observable build outputs and routing/caching artifacts rather than private internal implementation details.
- **Modules to be tested**:
  - Build artifact emission: Verifying that running the build produces the expected output directory structure including configuration files (`_headers`, `_redirects`).
  - Caching & redirection rules syntax: Validating that header and redirect definitions conform to platform specifications without syntax errors.
  - End-to-end unit suite & property probes: The full Vitest test suite and fatigue monotonic probe must pass cleanly before release.
- **Prior art**: Existing build and test steps in `.github/workflows/test.yml` and verification tests in `App.verification.test.jsx`.

## Out of Scope

- Native mobile app store builds or binary packaging (Capacitor Android APK/AAB / iOS IPA).
- Setting up paid third-party custom apex domains or DNS registrar migration.
- Server-side database, backend API, sync engines, or multi-user accounts (violates Sky's single-user local-first architecture).
- Bundling the complete 140 MB exercise media archive into the static deployment artifact.

## Further Notes

- Sky operates entirely in Guest mode; zero profile data is persisted on Cloudflare Pages.
- Cloudflare Pages provides automated TLS termination, satisfying the HTTPS requirements for both PWA installation and the Screen Wake Lock API.
