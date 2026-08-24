# Hosting Sky (Static Web App)

Sky is a pure static frontend (React 19 + Vite) with **no backend, no database, and no server**. All training logs, routines, and settings are stored locally in your browser (`localStorage` mirrored to `IndexedDB`).

Deploying Sky consists of building the frontend and serving the resulting static files from `frontend/dist`.

## 1. Build the static files

Requirements: [Node.js](https://nodejs.org/) 20+

```bash
cd frontend
npm install
npm run build
```

The production output is emitted to `frontend/dist/`. Because Vite is configured with `base: './'`, the static files use relative paths and will run from any domain, subpath, or static host.

## 2. Deployment Options

### Option A — GitHub Pages / Cloudflare Pages / GitLab Pages

1. Push your repository to your Git provider.
2. Configure Pages to publish the `frontend/dist` directory (or configure a static build step `cd frontend && npm install && npm run build`).
3. Your site is served over HTTPS automatically.

### Option B — Netlify / Vercel

- **Build command:** `cd frontend && npm install && npm run build`
- **Publish directory:** `frontend/dist`

### Option C — Caddy (Automatic HTTPS)

```caddy
sky.example.com {
    root * /var/www/sky/dist
    file_server
    try_files {path} /index.html
}
```

### Option D — Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name sky.example.com;

    root /var/www/sky/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Option E — Local static preview

To test the production build locally:

```bash
cd frontend
npm run preview
```

## 3. PWA Installation & HTTPS

Sky is installable as a Progressive Web App (PWA):

- **iOS (Safari):** Open your Sky URL in Safari → Tap the **Share** button → Tap **Add to Home Screen**.
- **Android (Chrome):** Open your Sky URL in Chrome → Tap **⋮** (Menu) → Tap **Install app** or **Add to Home screen**.

> [!IMPORTANT]
> Modern browsers require **HTTPS** (or `http://localhost`) for PWA installation and for the **Wake Lock API** (which keeps your phone screen awake while logging a workout). When hosting on a custom domain, ensure TLS/HTTPS is configured.

## 4. Exercise Media & Offline Support

- **Exercise Media:** Exercise thumbnails and animated demonstration GIFs stream on-demand from a pinned CDN dataset ([hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)). The ~140 MB media library does not need to be hosted on your server.
- **Offline Logging:** The service worker caches the application shell. Workout logging, plan management, fatigue calculations, and history work fully offline.

## 5. Backups & Portability

Because your data lives directly in your browser:
- Use **Settings → Export backup** to save your complete training history as a `sky-backup-<date>.json` file.
- To transfer data to another device or browser, import your backup file via **Settings → Import backup**.
- A gentle reminder will appear in Settings if an export has not been taken within 14 days.
