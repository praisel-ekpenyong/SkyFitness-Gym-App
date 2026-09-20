# Static-only: Sky keeps no backend

Sky is a static-build application by design — there is no server, no API, no cloud sync. Everything runs in the browser or as a packaged native shell (Capacitor) on iOS/Android. Every feature works against device-local storage, so the app is fully usable offline; this eliminates deployment, hosting, and security surface entirely. Consequence: features that *need* a server (accounts, sync between devices, server-scheduled notifications) are permanently out of scope rather than deferred.
