@echo off
echo [tauri-dev-prep] Copying front assets to debug target...
if not exist src-tauri\target\debug md src-tauri\target\debug
if exist src-tauri\target\debug\front rmdir /s /q src-tauri\target\debug\front
xcopy /e /i /q ..\back\bundle\front src-tauri\target\debug\front
echo [tauri-dev-prep] Done. You can now run: npm run dev
