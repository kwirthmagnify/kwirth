#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of electron-build-windows.cmd: builds the Windows installer and portable .exe from Linux.
# electron-builder needs wine for that (sudo apt install wine). RELEASES_DIR overrides the destination
# (default: the 'releases' folder next to the repo, the same place c:\github\releases is on Windows).

command -v wine >/dev/null 2>&1 || { echo "[electron-build-windows] ERROR: wine is needed to build the Windows .exe on Linux (sudo apt install wine)"; exit 1; }

RELEASES_DIR="${RELEASES_DIR:-$(cd ../../.. && pwd)/releases}"
mkdir -p "$RELEASES_DIR"

VER=$(sed -n 's/.*KWIRTH_VERSION="\([^"]*\)".*/\1/p' ../../version/version.cmd | tr -d '\r ')

rm -f "$RELEASES_DIR"/*-e.exe "$RELEASES_DIR"/*-e-installer.exe ./dist/*.blockmap

node -e "var f='package.json',fs=require('fs'),p=JSON.parse(fs.readFileSync(f)),v='${VER}'.trim();p.version=v;p.build.productName='kwirth-magnify-'+v+'-e';fs.writeFileSync(f,JSON.stringify(p,null,'\t'))"

npm run dist:win
mv -f dist/*.exe "$RELEASES_DIR"/

echo "[electron-build-windows] Done!"
