# Install prerrequisites

1. Microsoft C++ Build Tools
Tauri compila Rust con el toolchain MSVC, que necesita el linker de Visual Studio.

Descarga el instalador de Build Tools for Visual Studio:

visualstudio.microsoft.com/visual-cpp-build-tools/
En el instalador selecciona: "Desktop development with C++"
Ocupa ~7 GB
2. Rust (via rustup)

winget install Rustlang.Rustup
O descarga rustup-init.exe de rustup.rs. Acepta la instalación por defecto (usa MSVC automáticamente).

Verifica:


rustc --version
cargo --version
3. Node.js (si no lo tienes ya)

winget install OpenJS.NodeJS.LTS
WebView2
En Windows 11 ya viene preinstalado. No hay que hacer nada.

Una vez instalado todo, para buildear:

cd tauri
tauri-build.cmd
Aviso: la primera vez que ejecutes el build, Cargo descarga y compila Tauri y todas sus dependencias (~200 crates). Tarda entre 5 y 15 minutos. Las builds siguientes son mucho más rápidas.

# Launch with log
set PORT=3884
set AUTH=kubeconfig
set NODE_ENV=production
set ANSILOG=false
set FORCE=desktop
.\src-tauri\binaries\kwirth-backend-x86_64-pc-windows-msvc.exe

# Tauri build
npx @tauri-apps/cli build

# Tauri development (with dev tools)
npx tauri dev
