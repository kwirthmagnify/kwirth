@echo off
setlocal

echo [tauri-build] Building Windows...
call tauri-build-windows.cmd
if errorlevel 1 ( echo [tauri-build] ERROR: Windows build failed & exit /b 1 )

@REM echo.
@REM echo [tauri-build] Building Linux...
@REM call tauri-build-linux.cmd
@REM if errorlevel 1 ( echo [tauri-build] ERROR: Linux build failed & exit /b 1 )

echo.
echo [tauri-build] All done! Releases in c:\github\releases\
