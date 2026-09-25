#!/bin/bash
set -e

cd "$(dirname "$0")"

VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')
OUTPUT="marginal-voice-${VERSION}.xpi"

echo "Building Marginal Voice ${VERSION}..."

rm -f "${OUTPUT}"

zip -r "${OUTPUT}" \
  manifest.json \
  chrome.manifest \
  updates.json \
  bootstrap.js \
  prefs.js \
  modules/ \
  scripts/ \
  chrome/ \
  locale/ \
  skin/ \
  README.md \
  -x "*/__pycache__/*" "*/.DS_Store"

echo "Built: ${OUTPUT}"
