@echo off
setlocal

del c:\github\releases\*-t.deb 2>nul
del c:\github\releases\*-t.AppImage 2>nul

call ..\version\version.cmd
set VER=%KWIRTH_VERSION:"=%
:trimver
if "%VER:~-1%"==" " set VER=%VER:~0,-1%& goto trimver

echo [tauri-build-linux] Building Linux (via WSL Ubuntu)...
for /f "delims=" %%P in ('wsl -d Ubuntu wslpath -u "%CD%"') do set WSLDIR=%%P
wsl -d Ubuntu bash -l -c "export APPIMAGE_EXTRACT_AND_RUN=1 && cd '%WSLDIR%' && ./tauri-build.sh"
if errorlevel 1 (
    echo [tauri-build-linux] ERROR: Linux WSL build failed
    exit /b 1
)

echo [tauri-build-linux] Moving Linux packages to releases...
powershell -Command "$f=(Get-ChildItem 'src-tauri\target\release\bundle\deb\*.deb' -ErrorAction SilentlyContinue|Select-Object -First 1).FullName; if ($f){ Move-Item $f '\github\releases\kwirth-magnify-%VER%-t.deb' -Force }else{ Write-Host '[tauri-build-linux] No .deb found' }"
powershell -Command "$f=(Get-ChildItem 'src-tauri\target\release\bundle\appimage\*.AppImage' -ErrorAction SilentlyContinue|Select-Object -First 1).FullName; if ($f){ Move-Item $f '\github\releases\kwirth-magnify-%VER%-t.AppImage' -Force }else{ Write-Host '[tauri-build-linux] No .AppImage found' }"

echo [tauri-build-linux] Done!
