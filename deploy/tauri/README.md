# Install prerrequisites

## Windows

1. Microsoft C++ Build Tools
Tauri compila Rust con el toolchain MSVC, que necesita el linker de Visual Studio.

Descarga el instalador de Build Tools for Visual Studio:

visualstudio.microsoft.com/visual-cpp-build-tools/
En el instalador selecciona: "Desktop development with C++"
Ocupa ~7 GB

2. Rust (via rustup)

```
winget install Rustlang.Rustup
```
O descarga rustup-init.exe de rustup.rs. Acepta la instalación por defecto (usa MSVC automáticamente).

Verifica:

```
rustc --version
cargo --version
```

3. Node.js (si no lo tienes ya)

```
winget install OpenJS.NodeJS.LTS
```

4. WebView2
En Windows 11 ya viene preinstalado. No hay que hacer nada.

Una vez instalado todo, para buildear (Windows `.msi` + Linux `.deb`/`.AppImage` vía WSL):

```
cd deploy/tauri
tauri-build.cmd
```

## Linux (Ubuntu / Debian)

1. Librerías de sistema que Tauri enlaza

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

2. Rust (via rustup), con tu usuario normal, **sin sudo**: se instala en `~/.cargo`

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
source "$HOME/.cargo/env"
```

Verifica (en una terminal nueva):

```bash
rustc --version
cargo --version
```

3. Node.js 24 (si no lo tienes ya), por ejemplo con nvm o desde nodejs.org.

Una vez instalado todo, para buildear (`.deb` + `.AppImage`; el `.msi` solo se puede generar desde Windows):

```bash
cd deploy/tauri
./tauri-build-linux.sh
```

Los paquetes quedan en `~/github/releases` (la carpeta `releases` junto al repo); `RELEASES_DIR` la cambia.

## En ambos

`back/bundle` tiene que estar construido antes (`back/build.cmd` o `back/build.sh`).

Aviso: la primera vez que ejecutes el build, Cargo descarga y compila Tauri y todas sus dependencias (~200 crates). Tarda entre 5 y 15 minutos. Las builds siguientes son mucho más rápidas.

# Launch with log

Windows:

```
set PORT=3884
set AUTH=kubeconfig
set NODE_ENV=production
set ANSILOG=false
set FORCE=desktop
.\src-tauri\binaries\kwirth-backend-x86_64-pc-windows-msvc.exe
```

Linux:

```bash
PORT=3884 AUTH=kubeconfig NODE_ENV=production ANSILOG=false FORCE=desktop \
    ./src-tauri/binaries/kwirth-backend-x86_64-unknown-linux-gnu
```

# Linux on Wayland: the window buttons

With GTK on its native Wayland backend, the title bar only takes clicks while the window is maximized:
minimize, maximize and close do nothing otherwise. So on a Wayland session the app runs GTK through
XWayland — `GDK_BACKEND=x11`, set at the start of `run()` in `src-tauri/src/lib.rs` when nobody set it.

The AppImage already did this in its launcher (`linuxdeploy-plugin-gtk`); the `.deb` starts the binary
directly, which is why it only failed there. A `GDK_BACKEND` set by the user wins:
`GDK_BACKEND=wayland kwirth-magnify` forces native Wayland (and brings the problem back).

# Pending

- **The `.deb` package name carries the version** (`kwirth-magnify-0-6-110-t`), because the build puts it
  in `productName`. Each release is then a *different* package that writes the same files
  (`/usr/bin/kwirth-magnify`, `/usr/bin/kwirth-backend`), so installing the next one fails with
  *"trying to overwrite"* instead of upgrading, and the old one has to be removed by hand first.
- **Validate the Wayland fix on the next release**: install the new `.deb` on a GNOME Wayland session, open
  it from the applications menu and check that minimize, maximize and close work with the window not
  maximized (fix from 2026-11-14, not yet tried on an installed package).

# Tauri build
npx @tauri-apps/cli build

# Tauri development (with dev tools)

Antes, copia el front al target de debug: `tauri-dev-prep.cmd` (Windows) o `./tauri-dev-prep.sh` (Linux).

```
npx tauri dev
```
