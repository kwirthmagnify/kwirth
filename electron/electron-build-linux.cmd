@echo off
setlocal

call ..\version\version.cmd
set VER=%KWIRTH_VERSION:"=%

del \github\releases\*-e.AppImage 2>nul

node -e "var f='package.json',fs=require('fs'),p=JSON.parse(fs.readFileSync(f)),v='%VER%'.trim();p.version=v;p.build.productName='kwirth-magnify-'+v+'-e';fs.writeFileSync(f,JSON.stringify(p,null,'\t'))"

wsl -d Ubuntu bash -l -c "source ~/.bashrc; [ -s ~/.nvm/nvm.sh ] && source ~/.nvm/nvm.sh; cd /mnt/c/github/aisdkvercel/kwirth/electron && npm install && npm run dist:linux"
move dist\*.AppImage \github\releases

echo [electron-build-linux] Done!
