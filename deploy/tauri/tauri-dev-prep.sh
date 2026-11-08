#!/usr/bin/env bash
# Linux equivalent of tauri-dev-prep.cmd
set -euo pipefail
cd "$(dirname "$0")"

echo "[tauri-dev-prep] Copying front assets to debug target..."
mkdir -p src-tauri/target/debug
rm -rf src-tauri/target/debug/front
cp -r ../../back/bundle/front src-tauri/target/debug/front
echo "[tauri-dev-prep] Done. You can now run: npm run dev"
