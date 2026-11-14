@echo off
setlocal

echo [electron-build] Building Windows...
call electron-build-windows.cmd
if errorlevel 1 ( echo [electron-build] ERROR: Windows build failed & exit /b 1 )

@REM  echo.
@REM  echo [electron-build] Building Linux...
@REM  call electron-build-linux.cmd
@REM  if errorlevel 1 ( echo [electron-build] ERROR: Linux build failed & exit /b 1 )

echo.
echo [electron-build] All done! Releases in c:\github\releases\
