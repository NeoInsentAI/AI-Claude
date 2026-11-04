#!/bin/bash
# Double-click to start NeoInsent Invoicing and open it in the browser.
# The app keeps running in this Terminal window: close the window or press Ctrl+C to stop it.

# Always work from the folder this file lives in (the path may contain spaces).
cd "$(dirname "$0")" || exit 1

pause_and_exit() {
  echo
  read -r -p "Press Enter to close this window." _
  exit "${1:-1}"
}

# Terminal normally provides the user's PATH; add the usual install locations just in case.
export PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"

node_ok() {
  command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 &&
    [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" -ge 24 ] 2>/dev/null
}

# Node missing or older than 24: if nvm is installed, try its Node 24, then its default, then
# its newest version.
if ! node_ok && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
  for version in 24 default node; do
    nvm use "$version" >/dev/null 2>&1 && node_ok && break
  done
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 24 (or newer) from https://nodejs.org and try again."
  pause_and_exit 1
fi
if ! node_ok; then
  echo "NeoInsent needs Node.js 24 or newer (this Mac has $(node -v 2>/dev/null))."
  echo "Install Node.js 24 from https://nodejs.org and try again."
  pause_and_exit 1
fi

# Same port as the server: PORT from the environment, else PORT= in .env, else 5174.
if [ -z "$PORT" ] && [ -f .env ]; then
  PORT="$(sed -n 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*//p' .env | tail -n 1 | tr -d "\"' \r")"
fi
PORT="${PORT:-5174}"
URL="http://127.0.0.1:$PORT/"

is_running() {
  curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"neoinsent"'
}

if is_running; then
  echo "NeoInsent Invoicing is already running — opening $URL"
  open "$URL"
  exit 0
fi

# Install on the first start, and again whenever the app was updated with new components
# (package-lock.json newer than npm's record of what is installed).
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  if [ -d node_modules ]; then
    echo "The app was updated: installing its components (this takes a minute)…"
  else
    echo "First start: installing the app's components (this takes a minute)…"
  fi
  if ! npm install; then
    echo "Installing failed. Check your internet connection and try again."
    pause_and_exit 1
  fi
  # npm leaves the file alone when nothing changed; mark the install as up to date either way.
  touch node_modules/.package-lock.json
fi

# Wait in the background for the server to answer, then open the browser.
(
  for _ in $(seq 1 60); do
    sleep 1
    if is_running; then
      open "$URL"
      echo
      echo "NeoInsent Invoicing is running at $URL"
      echo "Close this window or press Ctrl+C to stop."
      exit 0
    fi
  done
  echo
  echo "NeoInsent did not start within 60 seconds. Look at the messages above for the reason."
) &
WAITER=$!
# However this script ends, stop the waiter too, so it never reports a startup timeout after the
# fact. Ctrl+C (INT) and closing the window (HUP) end the script right away, through that EXIT trap.
trap 'kill "$WAITER" 2>/dev/null' EXIT
trap 'exit 130' INT
trap 'exit 129' HUP

# Build the frontend and run the server in the foreground, so Ctrl+C stops it.
export PORT
npm start
STATUS=$?
kill "$WAITER" 2>/dev/null
# 130 = stopped with Ctrl+C, 129 = window closed: a normal stop, not an error.
if [ "$STATUS" -ne 0 ] && [ "$STATUS" -ne 130 ] && [ "$STATUS" -ne 129 ]; then
  echo
  echo "NeoInsent stopped with an error (see above)."
  pause_and_exit "$STATUS"
fi
exit 0
