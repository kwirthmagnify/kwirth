#!/usr/bin/env bash
# Linux equivalent of tauri-build-linux.cmd: builds the .deb and .AppImage natively (no WSL) with
# tauri-build.sh, and moves them to the releases folder as kwirth-magnify-<version>-t.{deb,AppImage}.
# RELEASES_DIR overrides the destination (default: the 'releases' folder next to the repo, the same
# place c:\github\releases is on Windows).
set -euo pipefail
cd "$(dirname "$0")"

RELEASES_DIR="${RELEASES_DIR:-$(cd ../../.. && pwd)/releases}"
mkdir -p "$RELEASES_DIR"

rm -f "$RELEASES_DIR"/*-t.deb "$RELEASES_DIR"/*-t.AppImage

VER=$(sed -n 's/.*KWIRTH_VERSION="\([^"]*\)".*/\1/p' ../../version/version.cmd | tr -d '\r ')

echo "[tauri-build-linux] Building Linux ${VER}..."
if ! ./tauri-build.sh; then
    echo "[tauri-build-linux] ERROR: Linux build failed"
    exit 1
fi

echo "[tauri-build-linux] Moving Linux packages to ${RELEASES_DIR}..."
move_first() {
    local pattern="$1" target="$2" label="$3" f
    f=$(ls $pattern 2>/dev/null | head -n 1 || true)
    if [ -n "$f" ]; then
        mv -f "$f" "$target"
        echo "[tauri-build-linux] $target"
    else
        echo "[tauri-build-linux] No $label found"
    fi
}
move_first 'src-tauri/target/release/bundle/deb/*.deb' "$RELEASES_DIR/kwirth-magnify-${VER}-t.deb" ".deb"
move_first 'src-tauri/target/release/bundle/appimage/*.AppImage' "$RELEASES_DIR/kwirth-magnify-${VER}-t.AppImage" ".AppImage"

echo "[tauri-build-linux] Done!"
