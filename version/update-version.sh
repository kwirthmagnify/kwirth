#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of update-version.cmd: bumps the level and regenerates version.ts/.js/.cmd
# (same format as the .cmd writes them, so both stay interchangeable).

major=$(tr -d '[:space:]' < major)
minor=$(tr -d '[:space:]' < minor)
level=$(tr -d '[:space:]' < level)
currversion="$major.$minor.$level"
level=$((level + 1))
echo "$level " > level
nextversion="$major.$minor.$level"
echo "$currversion to $nextversion"
echo "export const VERSION:string=\"$nextversion\"; " > version.ts
echo "const VERSION=\"$nextversion\"; module.exports = { VERSION }; " > version.js
echo "set KWIRTH_VERSION=\"$nextversion\" " > version.cmd
