@echo off
setlocal

del c:\github\releases\*-t-installer.exe 2>nul
del c:\github\releases\*-t.msi 2>nul
del .\src-tauri\target\release\bundle\msi\*.* /q 2>nul
del .\src-tauri\target\release\bundle\nsis\*.* /q 2>nul

call ..\version\version.cmd
set VER=%KWIRTH_VERSION:"=%
:trimver
if "%VER:~-1%"==" " set VER=%VER:~0,-1%& goto trimver

echo [tauri-build-windows] Updating version to %VER%...
powershell -ExecutionPolicy Bypass -File update-version.ps1 -Version %VER%

echo [tauri-build-windows] Installing npm dependencies...
call npm install

echo [tauri-build-windows] Copying front assets to resources...
if exist src-tauri\resources\front rmdir /s /q src-tauri\resources\front
xcopy /e /i /q ..\back\bundle\front src-tauri\resources\front

echo [tauri-build-windows] Generating Tauri icons...
copy ..\electron\kwirth-transparent.png src-tauri\icons\source.png
copy ..\electron\kwirth-transparent.png src-tauri\resources\kwirth-transparent.png
call npx @tauri-apps/cli icon src-tauri\icons\source.png

echo [tauri-build-windows] Downloading bundled extensions...
node ..\scripts\fetch-bundled.mjs ..\back\kwirth-bundled.json src-tauri\resources\bundled

echo [tauri-build-windows] Building kwirth-backend sidecar (Windows x64)...
copy back-bundle-pkg.json ..\back\bundle\package.json
cd ..\back\bundle
call npx --yes @yao-pkg/pkg bundle.js --target node24-win-x64 --output ..\..\tauri\src-tauri\binaries\kwirth-backend-x86_64-pc-windows-msvc.exe
del package.json
cd ..\..\tauri

echo [tauri-build-windows] Building Tauri application...
call npx @tauri-apps/cli build --config "{\"productName\":\"kwirth-magnify-%VER%-t\"}"

echo [tauri-build-windows] Copying front assets to release target...
if exist src-tauri\target\release\front rmdir /s /q src-tauri\target\release\front
xcopy /e /i /q ..\back\bundle\front src-tauri\target\release\front

echo [tauri-build-windows] Moving Windows installers to releases...
powershell -Command "Get-ChildItem 'src-tauri\target\release\bundle\msi\*.msi' | Select-Object -First 1 | Move-Item -Destination \github\releases\kwirth-magnify-%VER%-t.msi -Force"
powershell -Command "$f=(Get-ChildItem 'src-tauri\target\release\bundle\nsis\*.exe'|Select-Object -First 1).FullName; if ($f) { $r=5; while($r -gt 0){ try{ Move-Item $f '\github\releases\kwirth-magnify-%VER%-t-installer.exe' -Force; break }catch{ $r--; if($r -eq 0){ Write-Warning \"Could not move NSIS installer: $_\" }else{ Start-Sleep 3 } } } }"

echo [tauri-build-windows] Done!
