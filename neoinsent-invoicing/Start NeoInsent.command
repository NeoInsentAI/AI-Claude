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
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 24 (or newer) from https://nodejs.org and try again."
  pause_and_exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
if ! [ "$NODE_MAJOR" -ge 24 ] 2>/dev/null; then
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

if [ ! -d node_modules ]; then
  echo "First start: installing the app's components (this takes a minute)…"
  if ! npm install; then
    echo "Installing failed. Check your internet connection and try again."
    pause_and_exit 1
  fi
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

# Build the frontend and run the server in the foreground, so Ctrl+C stops it.
export PORT
npm start
STATUS=$?
kill "$WAITER" 2>/dev/null
if [ "$STATUS" -ne 0 ] && [ "$STATUS" -ne 130 ]; then
  echo
  echo "NeoInsent stopped with an error (see above)."
  pause_and_exit "$STATUS"
fi
exit 0
