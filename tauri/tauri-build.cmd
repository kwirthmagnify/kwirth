@echo off
setlocal

del c:\github\releases\*-t-installer.exe
del c:\github\releases\*-t.msi
del c:\github\releases\*-t.deb
del c:\github\releases\*-t.AppImage
del .\src-tauri\target\release\bundle\msi\*.* /q
del .\src-tauri\target\release\bundle\nsis\*.* /q

call ..\version\version.cmd
set VER=%KWIRTH_VERSION:"=%
:trimver
if "%VER:~-1%"==" " set VER=%VER:~0,-1%& goto trimver

echo [tauri-build] Updating version to %VER%...
powershell -ExecutionPolicy Bypass -File update-version.ps1 -Version %VER%

echo [tauri-build] Installing npm dependencies...
call npm install

echo [tauri-build] Copying front assets to resources (for bundle)...
if exist src-tauri\resources\front rmdir /s /q src-tauri\resources\front
xcopy /e /i /q ..\back\bundle\front src-tauri\resources\front

echo [tauri-build] Generating Tauri icons from electron source...
copy ..\electron\kwirth-transparent.png src-tauri\icons\source.png
copy ..\electron\kwirth-transparent.png src-tauri\resources\kwirth-transparent.png
call npx @tauri-apps/cli icon src-tauri\icons\source.png

echo [tauri-build] Downloading bundled plugins...
node ..\scripts\fetch-bundled-plugins.mjs ..\back\kwirth-bundled-plugins.json src-tauri\resources\bundled-plugins

echo [tauri-build] Building kwirth-backend sidecar (Windows x64)...
copy back-bundle-pkg.json ..\back\bundle\package.json
cd ..\back\bundle
call npx --yes @yao-pkg/pkg bundle.js --target node24-win-x64 --output ..\..\tauri\src-tauri\binaries\kwirth-backend-x86_64-pc-windows-msvc.exe
del package.json
cd ..\..\tauri

echo [tauri-build] Building Tauri application...
call npx @tauri-apps/cli build --config "{\"productName\":\"kwirth-magnify-%VER%-t\"}"

echo [tauri-build] Copying front assets to release target (for direct run)...
if exist src-tauri\target\release\front rmdir /s /q src-tauri\target\release\front
xcopy /e /i /q ..\back\bundle\front src-tauri\target\release\front

echo [tauri-build] Installer is in src-tauri\target\release\bundle\

echo [tauri-build] Moving Windows installers to releases...
powershell -Command "Get-ChildItem 'src-tauri\target\release\bundle\msi\*.msi' | Select-Object -First 1 | Move-Item -Destination \github\releases\kwirth-magnify-%VER%-t.msi -Force"
powershell -Command "$f=(Get-ChildItem 'src-tauri\target\release\bundle\nsis\*.exe'|Select-Object -First 1).FullName; if ($f) { $r=5; while($r -gt 0){ try{ Move-Item $f '\github\releases\kwirth-magnify-%VER%-t-installer.exe' -Force; break }catch{ $r--; if($r -eq 0){ Write-Warning \"Could not move NSIS installer: $_\" }else{ Start-Sleep 3 } } } }"

echo.
echo [tauri-build] Building Linux (via WSL Ubuntu)...
for /f "delims=" %%P in ('wsl -d Ubuntu wslpath -u "%CD%"') do set WSLDIR=%%P
wsl -d Ubuntu bash -l -c "cd '%WSLDIR%' && ./tauri-build.sh"
if errorlevel 1 (
    echo [tauri-build] ERROR: Linux WSL build failed
    exit /b 1
)

echo [tauri-build] Moving Linux packages to releases...
powershell -Command "$f=(Get-ChildItem 'src-tauri\target\release\bundle\deb\*.deb' -ErrorAction SilentlyContinue|Select-Object -First 1).FullName; if ($f){ Move-Item $f '\github\releases\kwirth-magnify-%VER%-t.deb' -Force }else{ Write-Host '[tauri-build] No .deb found — WSL may not have Linux toolchain configured' }"
powershell -Command "$f=(Get-ChildItem 'src-tauri\target\release\bundle\appimage\*.AppImage' -ErrorAction SilentlyContinue|Select-Object -First 1).FullName; if ($f){ Move-Item $f '\github\releases\kwirth-magnify-%VER%-t.AppImage' -Force }else{ Write-Host '[tauri-build] No .AppImage found — WSL may not have Linux toolchain configured' }"

echo [tauri-build] All done! Releases in c:\github\releases\