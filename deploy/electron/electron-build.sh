#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of electron-build.cmd: Windows and Linux packages. The Windows one needs wine; without it
# that part is skipped with a warning and only the Linux AppImage is built.

# if command -v wine >/dev/null 2>&1; then
#     echo "[electron-build] Building Windows..."
#     ./electron-build-windows.sh || { echo "[electron-build] ERROR: Windows build failed"; exit 1; }
# else
#     echo "[electron-build] WARNING: wine is not installed, skipping the Windows build (sudo apt install wine)"
# fi

echo
echo "[electron-build] Building Linux..."
./electron-build-linux.sh || { echo "[electron-build] ERROR: Linux build failed"; exit 1; }

echo
echo "[electron-build] All done! Releases in ${RELEASES_DIR:-$(cd ../../.. && pwd)/releases}"
