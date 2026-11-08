#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of electron-build-linux.cmd: builds the AppImage natively (no WSL) and moves it to the
# releases folder. RELEASES_DIR overrides it (default: the 'releases' folder next to the repo, the same
# place c:\github\releases is on Windows).

RELEASES_DIR="${RELEASES_DIR:-$(cd ../../.. && pwd)/releases}"
mkdir -p "$RELEASES_DIR"

VER=$(sed -n 's/.*KWIRTH_VERSION="\([^"]*\)".*/\1/p' ../../version/version.cmd | tr -d '\r ')

rm -f "$RELEASES_DIR"/*-e.AppImage

node -e "var f='package.json',fs=require('fs'),p=JSON.parse(fs.readFileSync(f)),v='${VER}'.trim();p.version=v;p.build.productName='kwirth-magnify-'+v+'-e';fs.writeFileSync(f,JSON.stringify(p,null,'\t'))"

npm install
npm run dist:linux
mv -f dist/*.AppImage "$RELEASES_DIR"/

echo "[electron-build-linux] Done!"
