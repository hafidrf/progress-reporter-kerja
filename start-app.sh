#!/usr/bin/env bash
# Launch Progress Reporter Kerja (macOS / Linux)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

# Finder / .command sessions use a minimal PATH (no Homebrew / npm).
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

DIST_HTML="$HERE/dist/index.html"
MAIN_JS="$HERE/dist-electron/main.js"

resolve_electron() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    local app="$HERE/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
    if [[ -x "$app" ]]; then
      echo "$app"
      return
    fi
  fi
  local bin="$HERE/node_modules/electron/dist/electron"
  if [[ -x "$bin" ]]; then
    echo "$bin"
    return
  fi
  return 1
}

if ! ELECTRON="$(resolve_electron)"; then
  if command -v osascript >/dev/null 2>&1; then
    osascript -e 'display dialog "Electron is not installed. Run npm install in the progress-reporter-kerja folder." with title "Progress Reporter Kerja" buttons {"OK"}' 2>/dev/null || true
  fi
  echo "Electron is not installed. Run: npm install" >&2
  exit 1
fi

if [[ ! -f "$DIST_HTML" || ! -f "$MAIN_JS" ]]; then
  if ! command -v npm >/dev/null 2>&1; then
    if command -v osascript >/dev/null 2>&1; then
      osascript -e 'display dialog "Build artifacts missing and npm was not found in PATH. Open Terminal, cd to the app folder, run npm run build, then try again." with title "Progress Reporter Kerja" buttons {"OK"}' 2>/dev/null || true
    fi
    echo "Missing dist/ and npm not on PATH. Run: npm run build" >&2
    exit 1
  fi
  npm run build
fi

exec "$ELECTRON" .
