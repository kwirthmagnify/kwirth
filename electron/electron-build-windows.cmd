@echo off
setlocal

call ..\version\version.cmd
set VER=%KWIRTH_VERSION:"=%

del \github\releases\*-e.exe 2>nul
del \github\releases\*-e-installer.exe 2>nul
del .\dist\*.blockmap 2>nul

node -e "var f='package.json',fs=require('fs'),p=JSON.parse(fs.readFileSync(f)),v='%VER%'.trim();p.version=v;p.build.productName='kwirth-magnify-'+v+'-e';fs.writeFileSync(f,JSON.stringify(p,null,'\t'))"

call npm run dist:win
move dist\*.exe \github\releases

echo [electron-build-windows] Done!
