@echo off
setlocal

echo [tauri-build] Building Windows...
call tauri-build-windows.cmd
if errorlevel 1 ( echo [tauri-build] ERROR: Windows build failed & exit /b 1 )

echo.
echo [tauri-build] Building Linux...
call tauri-build-linux.cmd
if errorlevel 1 ( echo [tauri-build] ERROR: Linux build failed & exit /b 1 )

echo.
echo [tauri-build] All done! Releases in c:\github\releases\
