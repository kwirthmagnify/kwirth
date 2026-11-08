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

# Tauri build
npx @tauri-apps/cli build

# Tauri development (with dev tools)

Antes, copia el front al target de debug: `tauri-dev-prep.cmd` (Windows) o `./tauri-dev-prep.sh` (Linux).

```
npx tauri dev
```
