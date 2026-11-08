#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of build-targets.cmd. The electron .exe needs wine (skipped with a warning without it) and the
# tauri .msi cannot be built on Linux at all, so tauri builds its Linux packages only.

./build.sh
../deploy/external/external-build.sh
../docker/docker-build.sh
../deploy/electron/electron-build.sh
../deploy/tauri/tauri-build-linux.sh
