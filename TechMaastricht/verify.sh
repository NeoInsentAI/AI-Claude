#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PAGES=(index.html about.html programs.html regional-hub.html events.html community.html contact.html)
fail=0

check_page() {
  local page="$1"
  local dir="$2"
  local path
  if [ "$dir" = "." ]; then
    path="$page"
  else
    path="$dir/$page"
  fi
  if [ ! -f "$path" ]; then
    echo "FAIL: $path missing"
    fail=1
    return
  fi
  grep -q "<!DOCTYPE html>" "$path" || { echo "FAIL: $path missing doctype"; fail=1; }
  grep -q "<title>" "$path" || { echo "FAIL: $path missing <title>"; fail=1; }
  grep -q 'name="description"' "$path" || { echo "FAIL: $path missing meta description"; fail=1; }
  grep -q '<footer' "$path" || { echo "FAIL: $path missing footer"; fail=1; }
  grep -q 'id="site-header"' "$path" || { echo "FAIL: $path missing site header"; fail=1; }
  grep -q 'id="nav-toggle"' "$path" || { echo "FAIL: $path missing nav-toggle button"; fail=1; }
  grep -q 'id="nav-links"' "$path" || { echo "FAIL: $path missing nav-links container"; fail=1; }
  grep -q 'class="lang-switch"' "$path" || { echo "FAIL: $path missing language switcher"; fail=1; }
  grep -q 'rel="canonical"' "$path" || { echo "FAIL: $path missing canonical tag"; fail=1; }
  grep -q 'hreflang="nl"' "$path" || { echo "FAIL: $path missing hreflang alternates"; fail=1; }
  grep -q 'property="og:image" content="https://' "$path" || { echo "FAIL: $path og:image not absolute"; fail=1; }
  if [ "$dir" = "." ]; then
    grep -q 'css/style.css"' "$path" || { echo "FAIL: $path missing stylesheet link"; fail=1; }
    grep -q 'js/main.js"' "$path" || { echo "FAIL: $path missing script tag"; fail=1; }
    grep -q '<html lang="nl">' "$path" || { echo "FAIL: $path missing lang=\"nl\""; fail=1; }
    grep -q '<span class="lang-active">NL</span>' "$path" || { echo "FAIL: $path lang switcher active state should be NL"; fail=1; }
  else
    grep -q '\.\./css/style.css"' "$path" || { echo "FAIL: $path missing stylesheet link"; fail=1; }
    grep -q '\.\./js/main.js"' "$path" || { echo "FAIL: $path missing script tag"; fail=1; }
    grep -q '<html lang="en">' "$path" || { echo "FAIL: $path missing lang=\"en\""; fail=1; }
    grep -q '<span class="lang-active">EN</span>' "$path" || { echo "FAIL: $path lang switcher active state should be EN"; fail=1; }
  fi
  for target in "${PAGES[@]}"; do
    grep -q "href=\"$target\"" "$path" || { echo "FAIL: $path missing nav link to $target"; fail=1; }
  done
}

for page in "${PAGES[@]}"; do
  check_page "$page" "."
  check_page "$page" "en"
done

if [ "$fail" -eq 0 ]; then
  echo "PASS: all 14 pages verified (7 Dutch at root, 7 English under en/)"
else
  exit 1
fi
