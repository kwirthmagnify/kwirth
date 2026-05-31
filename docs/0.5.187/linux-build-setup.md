# Linux Build Setup (WSL Ubuntu)

Both the Tauri and Electron Linux builds run via **WSL Ubuntu**. This document covers everything you need to install in that distribution.

## 1. Install Ubuntu in WSL

From PowerShell (Windows):

```powershell
wsl --install -d Ubuntu
```

After Ubuntu starts for the first time, create a user and password when prompted.

## 2. Update the system

```sh
sudo apt update && sudo apt upgrade -y
```

## 3. Install Node.js (v22 LTS)

!> Do **not** use `sudo apt install nodejs` — Ubuntu's default repo ships a very old Node without npm. Use one of the methods below instead.

**Option A — nvm (recommended, no sudo required):**

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
```

**Option B — NodeSource:**

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

If you already have a system Node installed without npm, remove it first:

```sh
sudo apt remove -y nodejs
```

Verify:

```sh
node --version   # v22.x
npm --version    # 10.x
```

## 4. Install Rust (required for Tauri only)

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env
```

Add to `~/.bashrc` so it loads on every login shell (`bash -l`):

```sh
echo 'source "$HOME/.cargo/env"' >> ~/.bashrc
```

Verify:

```sh
rustc --version
cargo --version
```

## 5. Install Tauri Linux system dependencies

```sh
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libssl-dev \
  libgtk-3-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev \
  build-essential \
  pkg-config
```

## 6. Install Electron Linux build dependencies

```sh
sudo apt install -y fuse libfuse2
```

> `fuse` / `libfuse2` are required for AppImage generation by electron-builder.

## 7. Verify the setup

Run this to confirm everything is in place:

```sh
node --version      # v22.x  (v20.x also works)
npm --version       # 10.x
rustc --version     # 1.x
cargo --version     # 1.x
pkg-config --modversion webkit2gtk-4.1   # 2.x
```

## Notes

- Both build scripts use `wsl -d Ubuntu bash -l -c "..."` — the `-l` flag loads the login profile so `~/.cargo/env` and `~/.bashrc` are sourced automatically.
- The builds run in the current Windows directory as seen from WSL (mounted under `/mnt/c/...`). No extra `cd` configuration is needed.
- If you have multiple Ubuntu distributions, use `wsl --list` to see the exact name and adjust the `-d` argument in the build scripts if needed.
