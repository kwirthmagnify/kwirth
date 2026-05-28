#!/bin/bash
set -e

VER=$(grep -oP '(?<=KWIRTH_VERSION=")[^"]+' ../version/version.cmd 2>/dev/null || echo "0.0.0")
echo "[tauri-build] Updating version to ${VER}..."
sed -i "s/^version = \"[0-9.]*\"/version = \"${VER}\"/" src-tauri/Cargo.toml
sed -i "s/\"version\": \"[0-9.]*\"/\"version\": \"${VER}\"/" src-tauri/tauri.conf.json
sed -i "s/v[0-9]\+\.[0-9]\+\.[0-9]\+/v${VER}/g" src-tauri/resources/splash.html

echo "[tauri-build] Installing npm dependencies..."
npm install

echo "[tauri-build] Copying front assets..."
rm -rf src-tauri/resources/front
cp -r ../back/bundle/front src-tauri/resources/front

echo "[tauri-build] Generating Tauri icons from electron source..."
cp ../electron/kwirth-transparent.png src-tauri/icons/source.png
cp ../electron/kwirth-transparent.png src-tauri/resources/kwirth-transparent.png
npx @tauri-apps/cli icon src-tauri/icons/source.png

echo "[tauri-build] Detecting platform..."
UNAME=$(uname -s)
ARCH=$(uname -m)

if [ "$UNAME" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        PKG_TARGET="node24-macos-arm64"
        TRIPLE="aarch64-apple-darwin"
    else
        PKG_TARGET="node24-macos-x64"
        TRIPLE="x86_64-apple-darwin"
    fi
else
    PKG_TARGET="node24-linux-x64"
    TRIPLE="x86_64-unknown-linux-gnu"
fi

echo "[tauri-build] Building kwirth-backend sidecar (${TRIPLE})..."
cp back-bundle-pkg.json ../back/bundle/package.json
cd ../back/bundle
npx --yes @yao-pkg/pkg bundle.js --target "$PKG_TARGET" --output "../../tauri/src-tauri/binaries/kwirth-backend-${TRIPLE}"
rm -f package.json
cd ../../tauri

echo "[tauri-build] Building Tauri application..."
npx @tauri-apps/cli build

echo "[tauri-build] Done! Check src-tauri/target/release/bundle/"
