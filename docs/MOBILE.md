# Building the mobile app (iOS / Android)

Sky runs as a backend-free application on mobile devices in two ways:

| | **Home-screen PWA** (recommended) | **Native Mobile App** (`VITE_MOBILE=1`) |
|---|---|---|
| Runs | in mobile browser (Safari / Chrome) added to home screen | natively on iPhone / Android via Capacitor shell |
| Accounts | none — profile stored locally in browser storage | none — profile stored in private app storage |
| Data | mirrored in `localStorage` + `IndexedDB` (`lib/storage.js`) | mirrored to `opengym-state.json` via `@capacitor/filesystem` |
| Reminders | local Notification API | native local notifications (`@capacitor/local-notifications`) |
| Exercise media | streamed from jsDelivr CDN | streamed from jsDelivr CDN |

The mobile flavor never talks to a backend: no sign-in screen, no server sync, and no telemetry.

## Prerequisites

- Node.js 20+
- **Android:** Android Studio (bundles the Android SDK) and Java 21 for Gradle.
- **iOS:** A Mac with Xcode 15+ and CocoaPods (`brew install cocoapods`). A free Apple ID is sufficient to install and run the app on your personal iPhone.

## Build & Run

```sh
cd frontend
npm install
npm run build:mobile        # builds frontend with VITE_MOBILE=1 + syncs Capacitor into android/ and ios/

npx cap open android        # opens Android Studio → run on emulator or connected Android device
npx cap open ios            # opens Xcode (Mac only) → configure signing team, then run
```

`npm run build:mobile` builds the static app with mobile bindings and copies the output into both native projects. Re-run after frontend changes before building natively.

## App Icons & Splash Screens

`frontend/resources/icon.svg` is the 1024×1024 source asset. Generate all platform assets using:

```sh
cd frontend
npx @capacitor/assets generate --iconBackgroundColor '#0c0e12' --splashBackgroundColor '#0c0e12'
```

## Running on Devices

### iPhone (iOS)

- **PWA (Recommended):** Host the static build over HTTPS (or use local preview) → Open in Safari → Tap **Share** → **Add to Home Screen**. Full-screen app, persistent storage, offline service worker support, and no signing expiration.
- **Xcode Direct Run:** Open `ios/` in Xcode with your Apple ID and deploy to your connected device. Free Apple IDs expire signatures after 7 days (re-run to renew).

### Android

- Build the release APK from Android Studio or command line:
  ```sh
  cd frontend && npm run build:mobile
  cd android && ./gradlew assembleRelease
  ```
- Install the resulting APK on your device.

## Notifications & Permissions

- Notification permissions are requested only when the workout-day reminder is enabled in Settings.
- On Android, `SCHEDULE_EXACT_ALARM` is declared in `AndroidManifest.xml` so reminders fire accurately.
- Keep Screen Awake (Wake Lock) keeps your screen active during logged workout sessions.
