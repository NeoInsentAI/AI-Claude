#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PAGES=(index.html about.html programs.html regional-hub.html events.html community.html contact.html)
fail=0
for page in "${PAGES[@]}"; do
  if [ ! -f "$page" ]; then
    echo "FAIL: $page missing"
    fail=1
    continue
  fi
  grep -q "<!DOCTYPE html>" "$page" || { echo "FAIL: $page missing doctype"; fail=1; }
  grep -q "<title>" "$page" || { echo "FAIL: $page missing <title>"; fail=1; }
  grep -q 'name="description"' "$page" || { echo "FAIL: $page missing meta description"; fail=1; }
  grep -q 'css/style.css' "$page" || { echo "FAIL: $page missing stylesheet link"; fail=1; }
  grep -q 'js/main.js' "$page" || { echo "FAIL: $page missing script tag"; fail=1; }
  grep -q '<footer' "$page" || { echo "FAIL: $page missing footer"; fail=1; }
  grep -q 'id="site-header"' "$page" || { echo "FAIL: $page missing site header"; fail=1; }
  for target in "${PAGES[@]}"; do
    grep -q "href=\"$target\"" "$page" || { echo "FAIL: $page missing nav link to $target"; fail=1; }
  done
done
if [ "$fail" -eq 0 ]; then
  echo "PASS: all ${#PAGES[@]} pages verified"
else
  exit 1
fi
