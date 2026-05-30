#!/bin/bash
set -e

# portable sed -i: macOS requires an explicit backup extension
sedi() {
    if [ "$(uname -s)" = "Darwin" ]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# grep -oP is Linux-only; use portable sed extraction instead
VER=$(sed -n 's/.*KWIRTH_VERSION="\([^"]*\)".*/\1/p' ../version/version.cmd 2>/dev/null | tr -d '\r' || echo "0.0.0")
echo "[tauri-build] Updating version to ${VER}..."
sedi "s/^version = \"[0-9.]*\"/version = \"${VER}\"/" src-tauri/Cargo.toml
sedi "s/\"version\": \"[0-9.]*\"/\"version\": \"${VER}\"/" src-tauri/tauri.conf.json
sedi "s/v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*/v${VER}/g" src-tauri/resources/splash.html

echo "[tauri-build] Installing npm dependencies..."
npm install

echo "[tauri-build] Copying front assets..."
rm -rf src-tauri/resources/front
cp -r ../back/bundle/front src-tauri/resources/front

echo "[tauri-build] Generating Tauri icons from electron source..."
cp ../electron/kwirth-transparent.png src-tauri/icons/source.png
cp ../electron/kwirth-transparent.png src-tauri/resources/kwirth-transparent.png
npx @tauri-apps/cli icon src-tauri/icons/source.png

echo "[tauri-build] Downloading bundled plugins..."
node ../scripts/fetch-bundled-plugins.mjs ../back/kwirth-bundled-plugins.json src-tauri/resources/bundled-plugins

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
npx @tauri-apps/cli build --config "{\"productName\":\"kwirth-magnify-${VER}-t\"}"

echo "[tauri-build] Done! Check src-tauri/target/release/bundle/"
