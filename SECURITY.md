# Security & Privacy Policy

Sky is a personal, backend-free web application: it runs entirely within your browser or mobile web view with no server, no user accounts, and no central database.

## Privacy & Network Isolation

- **No backend attack surface:** Sky does not run a server, API, or database service. There are no user sessions, passkeys, cookies, or credentials to intercept or exploit.
- **Zero telemetry:** Sky contains no tracking scripts, analytics, or third-party telemetry.
- **Minimal network calls:** The only outbound network requests made by Sky during operation are for public exercise media (images and animations) fetched from a pinned CDN dataset ([hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset)).

## Data Storage & Local Security

- **Storage boundaries:** All training history, routines, weigh-ins, and settings reside strictly on your device inside browser storage (`localStorage` and `IndexedDB`).
- **Durable dual-write:** To prevent data loss from browser storage reclamation (such as iOS Safari storage pressure), data is mirrored across `localStorage` and `IndexedDB` with automatic newest-timestamp recovery.
- **Backups:** JSON backup exports (`sky-backup-<date>.json`) are unencrypted files. You own and control where these files are stored and shared.
- **Same-origin security:** Standard browser same-origin policies protect local storage from access by other websites.

## Reporting Issues & Vulnerabilities

If you discover a client-side security issue or unexpected network transmission, please open an issue in this repository.
