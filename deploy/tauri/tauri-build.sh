#!/bin/bash
set -e

# Under WSL the PATH carries every Windows directory (/mnt/c/...). Out with them: npm resolved to the
# Windows one, and linuxdeploy walks the whole PATH and aborts on the first it cannot read
# ("boost::filesystem::status: Permission denied: .../WindowsApps") — which is what killed the AppImage.
export PATH=$(echo "$PATH" | tr ':' '\n' | grep -v '^/mnt/' | paste -sd: -)

# Load nvm and cargo if available (needed when invoked non-interactively from WSL)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
[ -s "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

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
VER=$(sed -n 's/.*KWIRTH_VERSION="\([^"]*\)".*/\1/p' ../../version/version.cmd 2>/dev/null | tr -d '\r' || echo "0.0.0")
echo "[tauri-build] Updating version to ${VER}..."
sedi "s/^version = \"[0-9.]*\"/version = \"${VER}\"/" src-tauri/Cargo.toml
sedi "s/\"version\": \"[0-9.]*\"/\"version\": \"${VER}\"/" src-tauri/tauri.conf.json
sedi "s/v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*/v${VER}/g" src-tauri/splash/splash.html

echo "[tauri-build] Installing npm dependencies..."
npm install

echo "[tauri-build] Copying front assets..."
rm -rf src-tauri/resources/front
cp -r ../../back/bundle/front src-tauri/resources/front

echo "[tauri-build] Generating Tauri icons from electron source..."
cp ../electron/kwirth-transparent.png src-tauri/icons/source.png
cp ../electron/kwirth-transparent.png src-tauri/splash/kwirth-transparent.png
npx @tauri-apps/cli icon src-tauri/icons/source.png

echo "[tauri-build] Downloading bundled extensions..."
node ../../tools/scripts/fetch-bundled.mjs ../../back/kwirth-bundled-desktop.json src-tauri/resources/bundled

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
cp back-bundle-pkg.json ../../back/bundle/package.json
cd ../../back/bundle
npx --yes @yao-pkg/pkg bundle.js --target "$PKG_TARGET" --output "../../deploy/tauri/src-tauri/binaries/kwirth-backend-${TRIPLE}"
rm -f package.json
cd ../../deploy/tauri

echo "[tauri-build] Building Tauri application..."
export CARGO_TARGET_DIR="$HOME/.kwirth-tauri-target"

#   linuxdeploy runs without FUSE through APPIMAGE_EXTRACT_AND_RUN=1, exported above and inherited by it
# and by its plugins. It used to be wrapped in a shell script instead, and that broke every AppImage:
# tauri patches linuxdeploy-x86_64.AppImage by zeroing bytes 8-10 (the AppImage magic), which on the
# wrapper fell on the shebang ('#!/bin/s\0\0\0') -> "failed to bundle project: No such file or directory".
# Undo any wrapper left by older builds: the real AppImage goes back to its name.
for name in linuxdeploy-x86_64.AppImage linuxdeploy-plugin-appimage.AppImage; do
    f="$HOME/.cache/tauri/$name"
    if [ -f "$f.real" ]; then
        mv -f "$f.real" "$f"
        echo "[tauri-build] Unwrapped: $f"
    fi
done

# Only this build's packages: the bundle folders kept every previous one (a 0.5.134 .deb from May among
# them), and the .cmd moves the FIRST it finds to releases.
rm -rf "$CARGO_TARGET_DIR"/release/bundle/deb "$CARGO_TARGET_DIR"/release/bundle/appimage
rm -rf src-tauri/target/release/bundle/deb src-tauri/target/release/bundle/appimage

# Add tauri tool cache to PATH so linuxdeploy can find its plugins
export PATH="$HOME/.cache/tauri:$PATH"

npx @tauri-apps/cli build --config "{\"productName\":\"kwirth-magnify-${VER}-t\"}"

echo "[tauri-build] Copying bundles back to project path..."
mkdir -p src-tauri/target/release/bundle/appimage
mkdir -p src-tauri/target/release/bundle/deb
cp "$CARGO_TARGET_DIR"/release/bundle/appimage/*.AppImage src-tauri/target/release/bundle/appimage/ 2>/dev/null || true
cp "$CARGO_TARGET_DIR"/release/bundle/deb/*.deb          src-tauri/target/release/bundle/deb/      2>/dev/null || true

echo "[tauri-build] Done! Check src-tauri/target/release/bundle/"
