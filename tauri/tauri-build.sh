#!/bin/bash
set -e

# Load nvm if available (needed when invoked non-interactively from WSL)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

# Required for AppImage tools (linuxdeploy) to run in WSL without FUSE
export APPIMAGE_EXTRACT_AND_RUN=1

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
export CARGO_TARGET_DIR="$HOME/.kwirth-tauri-target"

# Wrap linuxdeploy AppImages so they run without FUSE in WSL.
# Python script written to /tmp (native Linux fs) via printf to guarantee LF-only endings.
printf '%s\n' \
    'import os, stat' \
    'cache = os.path.expanduser("~/.cache/tauri")' \
    'for name in ["linuxdeploy-x86_64.AppImage", "linuxdeploy-plugin-appimage.AppImage"]:' \
    '    f = os.path.join(cache, name)' \
    '    r = f + ".real"' \
    '    if os.path.isfile(f) and not os.path.isfile(r):' \
    '        os.rename(f, r)' \
    '    if os.path.isfile(r):' \
    '        open(f, "w", newline="").write("#!/bin/sh\nexport APPIMAGE_EXTRACT_AND_RUN=1\nexec \"" + r + "\" \"$@\"\n")' \
    '        os.chmod(f, 0o755)' \
    '        print("[tauri-build] Wrapped: " + f)' \
    > /tmp/wrap-appimage.py
python3 /tmp/wrap-appimage.py

npx @tauri-apps/cli build --config "{\"productName\":\"kwirth-magnify-${VER}-t\"}"

echo "[tauri-build] Copying bundles back to project path..."
mkdir -p src-tauri/target/release/bundle/appimage
mkdir -p src-tauri/target/release/bundle/deb
cp "$CARGO_TARGET_DIR"/release/bundle/appimage/*.AppImage src-tauri/target/release/bundle/appimage/ 2>/dev/null || true
cp "$CARGO_TARGET_DIR"/release/bundle/deb/*.deb          src-tauri/target/release/bundle/deb/      2>/dev/null || true

echo "[tauri-build] Done! Check src-tauri/target/release/bundle/"
