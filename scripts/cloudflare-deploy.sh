#!/usr/bin/env bash
#
# Cloudflare Pages Deploy Wizard for Sky
# Walks a human through deploying frontend/dist to skyfitness.pages.dev
#

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library — delightful, consistent UX. Identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); RED=$(tput setaf 1)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""; RED=""
fi

TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()
WRITTEN_SECRET=()
SKIPPED=()

_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1; then tput clear; else printf '\033[2J\033[3J\033[H'; fi
}

banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later — it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

say()  { printf '  %s\n' "$1"; }
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else warn "couldn't open a browser — visit it manually: $url"; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser — visit it manually: $url"
}

pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  printf '%s' "${line#*=}"
}

ask() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -r input || true
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

ask_secret() {
  local key="$1" prompt="$2" current input
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || true
  printf '\n'
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

write_env() {
  local key="$1" value="$2" tmp
  touch "$ENV_FILE"
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub secret $name (set it manually: gh secret set $name)")
  warn "skipped GitHub secret $name — gh not ready; set it later"
}

set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub variable $name")
  warn "skipped GitHub variable $name — gh not ready; set it later"
}

finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES — Sky Cloudflare Pages Deploy
# ──────────────────────────────────────────────────────────────────────────

TOTAL_STAGES=6

banner "Sky → Cloudflare Pages Deploy (skyfitness.pages.dev)"

# ── Stage 1: Verify build artifact ──────────────────────────────────────
stage "Verify build artifact"
say "Sky builds to frontend/dist with Vite (base:'./'). Cloudflare needs _headers + _redirects."
if [[ -f "frontend/dist/index.html" && -f "frontend/dist/_headers" && -f "frontend/dist/_redirects" ]]; then
  say "Found frontend/dist/index.html, _headers, _redirects — build looks ready."
  note "$(ls -lh frontend/dist/ | head -20)"
  if confirm "Rebuild now (npm run build)?"; then
    (cd frontend && npm run build)
    say "Rebuilt. Check new assets:"
    note "$(ls -lh frontend/dist/assets/body-paths*.js 2>/dev/null || echo 'no body-paths asset?')"
  fi
else
  warn "frontend/dist missing or incomplete. Building now..."
  say "Running: cd frontend && npm install && npm run build"
  (cd frontend && npm install && npm run build)
  if [[ -f "frontend/dist/_headers" ]]; then
    printf '  %s✓ build ready%s\n' "$GREEN" "$RESET"
  else
    warn "Build still missing _headers/_redirects — check frontend/public/"
  fi
fi
say "Expected dist contents: index.html, sw.js, manifest.json, _headers, _redirects, assets/body-paths-*.js (93.27 kB)"
note "Current dist: $(du -sh frontend/dist 2>/dev/null | cut -f1)"
pause "Build verified — press Enter to continue to Cloudflare auth"

# ── Stage 2: Authenticate wrangler ──────────────────────────────────────
stage "Authenticate with Cloudflare (wrangler login)"
say "Deploy uses wrangler pages deploy. You need a Cloudflare account (free)."
open_url "https://dash.cloudflare.com/login"
step "If you have no account, create one (free) — no credit card needed for Pages."
step "We'll run 'npx wrangler login' which opens a browser OAuth flow."
note "Tip: If you're on WSL/Remote, wrangler will print a URL to open manually."
if command -v npx >/dev/null 2>&1; then
  if npx wrangler whoami >/dev/null 2>&1; then
    say "Already authenticated:"
    npx wrangler whoami 2>&1 | sed 's/^/  /'
    if confirm "Re-login to switch accounts?"; then
      npx wrangler login
    fi
  else
    say "Running: npx wrangler login"
    note "Browser will open — approve the OAuth prompt, then return here."
    npx wrangler login || warn "wrangler login failed — you can also use CLOUDFLARE_API_TOKEN (see next stage)"
  fi
else
  warn "npx not found — install Node.js 20+ first."
fi
# Alternative token path
say "Alternative: API token (if login doesn't work in this shell)"
open_url "https://dash.cloudflare.com/profile/api-tokens"
step "Create Token → Edit Cloudflare Workers (or Pages) → copy token."
ask_secret CLOUDFLARE_API_TOKEN "Paste API token (or Enter to skip):"
if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  write_env CLOUDFLARE_API_TOKEN "$CLOUDFLARE_API_TOKEN"
  export CLOUDFLARE_API_TOKEN
  say "Token saved to .env and exported for this run."
fi
pause "Auth step done — press Enter to deploy"

# ── Stage 3: Direct deploy via wrangler ─────────────────────────────────
stage "Deploy static assets to Cloudflare Pages"
say "Project name skyfitness → https://skyfitness.pages.dev (per spec)."
say "This does a direct upload of frontend/dist (no Git needed yet)."
ask PAGES_PROJECT "Project name [skyfitness]:" 
PAGES_PROJECT="${PAGES_PROJECT:-skyfitness}"
write_env PAGES_PROJECT "$PAGES_PROJECT"
note "Running: npx wrangler pages deploy frontend/dist --project-name=$PAGES_PROJECT"
if confirm "Deploy now?"; then
  if npx wrangler pages deploy frontend/dist --project-name="$PAGES_PROJECT"; then
    printf '  %s✓ deployed%s to %s.pages.dev\n' "$GREEN" "$RESET" "$PAGES_PROJECT"
  else
    warn "Deploy failed."
    say "Common fixes:"
    step "If project doesn't exist, create it first: dash.cloudflare.com → Workers & Pages → Create application → Pages → Connect to Git (skip) or Create project"
    open_url "https://dash.cloudflare.com/?to=/:account/pages"
    note "Or run: npx wrangler pages project create $PAGES_PROJECT"
    if confirm "Create project now via wrangler?"; then
      npx wrangler pages project create "$PAGES_PROJECT" --production-branch=main || warn "Create failed — create manually in dashboard"
      npx wrangler pages deploy frontend/dist --project-name="$PAGES_PROJECT" || warn "Retry deploy after creating project"
    fi
  fi
else
  note "Skipped direct deploy — you can run later: npx wrangler pages deploy frontend/dist --project-name=$PAGES_PROJECT"
fi
pause "Deploy step done — press Enter to set up Git auto-deploy"

# ── Stage 4: Configure Cloudflare Pages — _headers / _redirects / caching ─
stage "Verify platform config (caching & SPA fallback)"
say "Sky ships _headers and _redirects in frontend/public/ — already in dist."
say "Current _headers content:"
note "$(cat frontend/dist/_headers 2>/dev/null | sed 's/^/  /')"
say "Current _redirects content:"
note "$(cat frontend/dist/_redirects 2>/dev/null | sed 's/^/  /')"
say "Spec requires:"
step "index.html, sw.js, manifest.json → no-cache, no-store, must-revalidate"
step "assets/* → public, max-age=31536000, immutable"
step "/* → /index.html 200 (SPA fallback) — already in _redirects"
note "These are applied automatically by Cloudflare Pages on deploy."
if confirm "Open the live site to verify headers?"; then
  open_url "https://$PAGES_PROJECT.pages.dev"
  say "Check DevTools → Network → index.html → Cache-Control should be no-cache"
  say "Check assets/index-*.js → Cache-Control should be immutable"
fi
pause "Caching verified — press Enter for Git integration"

# ── Stage 5: Git-native auto-deploy (main branch) ───────────────────────
stage "Connect GitHub repo for auto-deploy on push to main"
say "Spec Implementation Decision 3-4: Git-native integration (recommended for zero manual uploads)."
open_url "https://dash.cloudflare.com/?to=/:account/pages"
step "Click 'Create application' → 'Pages' → 'Connect to Git' → select your GitHub repo (opengym/sky or fork)"
step "Configure build settings exactly:"
note "  Framework preset: Vite (or None)"
note "  Root directory: frontend"
note "  Build command: npm run build"
note "  Build output directory: dist"
note "  Environment variables → Add variable → NODE_VERSION = 22"
step "Set project name to '$PAGES_PROJECT' (must match direct upload project to reuse domain)"
step "Click 'Save and Deploy' — Cloudflare will build and deploy main automatically"
say "Media streaming: ~140 MB in public/media/ is NOT bundled (gitignored) — animations stream from CDN per spec. Don't add it."
ask GITHUB_REPO "GitHub repo (owner/name) for reference:"
if [[ -n "${GITHUB_REPO:-}" ]]; then
  write_env GITHUB_REPO "$GITHUB_REPO"
fi
pause "Once dashboard shows 'Success' with a pages.dev URL, press Enter"

# ── Stage 6: Verify PWA, routing, data locality ─────────────────────────
stage "Verify deployment — PWA, routing, privacy"
open_url "https://$PAGES_PROJECT.pages.dev"
step "Test deep link: open https://$PAGES_PROJECT.pages.dev/#/stats then refresh — should NOT 404 (SPA fallback via _redirects)"
step "Test PWA: open on iOS Safari / Android Chrome → Share → Add to Home Screen → should install over HTTPS (spec US 3-4)"
step "Test data locality: open DevTools → Application → Local Storage → gym_state_v1 — data stays on device, never sent to Cloudflare (spec US 5)"
step "Test media streaming: open Library → pick exercise → image/GIF should load from CDN, not from dist (fast <2 MB initial load, spec US 8-9)"
step "Test update freshness: deploy a new commit to main → dashboard auto-builds → refresh site → new sw.js should be no-cache (spec US 11)"
say "Docs: self-hosting guide is in docs/SELF_HOSTING.md (Option A Cloudflare Pages)"
note "If you used direct upload, future pushes still need 'npx wrangler pages deploy' unless Git is connected"
if confirm "Run local deploy-preview check now (npm run test:preview)?"; then
  (cd frontend && npm run test:preview 2>&1 | sed 's/^/  /' || warn "test:preview not configured — check package.json")
fi

finish
printf '%sNext: commit this wizard if you want repeatable setup:%s\n' "$DIM" "$RESET"
note "  git add scripts/cloudflare-deploy.sh && git commit -m 'chore(deploy): cloudflare wizard'"
note "Live URL: https://$PAGES_PROJECT.pages.dev"
