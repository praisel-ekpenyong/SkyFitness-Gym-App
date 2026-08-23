# 02 — Sky branding

**What to build:** The app presents itself as "Sky". Opening it in a browser shows the Sky name (page title), installing it to a home screen shows "Sky" (PWA manifest name), and the factory-default look is light theme with green & white accents. Dark mode remains available through the existing toggle, and any theme choice still persists.

**Blocked by:** 01 — Git baseline.

**Status:** ready-for-agent

- [x] Browser tab title reads "Sky"
- [x] PWA manifest name / short_name read "Sky" so home-screen installs show Sky
- [x] Default state ships light theme with a green accent from the existing accent palette
- [x] Switching to dark (and back) still works and persists across reloads
- [x] Existing app icons retained unchanged
- [x] Vitest suite stays green

## Comments

Done. Title and apple-mobile-web-app-title in `frontend/index.html` are now "Sky"; manifest `name`/`short_name` are "Sky". The manifest splash colors and the static `theme-color` meta were moved to the light-theme surface (`#f2f2f7`) so the factory-default first paint matches; at runtime `applyPrefs` still updates the meta on every theme switch as before.

Factory default flipped in one place: `DEF.theme: 'dark' -> 'light'` in `store/useStore.js`. Accent stays `'lime'`, which maps to the palette's green (`--acc: var(--green)`) — no new colour introduced. Dark mode is untouched: same Settings toggle, same persistence path (`update()` → localStorage), and any profile that already chose a theme keeps it because loaded state overlays DEF only for missing keys.

Icons untouched. Verified: Vitest 346/346 green, production build succeeds.

Browser click-through (CONTRIBUTING's "test the flow you touched"), via Playwright against `vite preview` of the production build on :4190 — note the dev server on :5173 belongs to a different checkout (Downloads copy) and was left alone:

- Fresh profile, first boot → title "Sky", `data-theme=light`, `data-accent=lime`, computed `--acc #34c759` / `--bg #f2f2f7`, theme-color meta `#f2f2f7`; Settings shows Light pressed.
- Guest mode → Settings → Theme Dark → applied (`--bg #000`), meta flips to `#000000`, localStorage `theme: 'dark'`.
- Reload → still dark. Toggle back to Light → applied and stored (`theme: 'light'`).
- Served manifest.json confirms name/short_name "Sky" + light splash colors.
