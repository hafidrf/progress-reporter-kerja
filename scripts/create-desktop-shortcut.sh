#!/usr/bin/env bash
# Thin wrapper — prefer: npm run desktop-shortcut
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
exec node "$ROOT/scripts/create-desktop-shortcut.mjs"
