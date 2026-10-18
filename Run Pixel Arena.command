#!/bin/zsh -l
# Double-click in Finder to open Pixel Arena (desktop / Electron version).
# Installs dependencies on first run, builds the web app, then starts Electron.
# Extra arguments go to Electron, e.g. ./Run\ Pixel\ Arena.command --selftest=desktop
set -e
cd "$(dirname "$0")/web"

# Finder starts scripts with a minimal PATH; add the usual Node locations.
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v npm >/dev/null; then
  echo "Node.js (npm) not found. Install it, e.g. 'brew install node@24', then try again."
  read -k1 "?Press any key to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies…"
  npm install
fi
# npm here skips install scripts, so fetch the Electron binary if it's missing.
if [ ! -d node_modules/electron/dist ]; then
  echo "Downloading Electron…"
  node node_modules/electron/install.js
fi

echo "Building…"
npm run build -w app --silent >/dev/null
exec node_modules/.bin/electron desktop "$@"
