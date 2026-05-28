call ..\version\version.cmd
set VER=%KWIRTH_VERSION:"=%

del \github\releases\*.exe
del \github\releases\*.AppImage
del .\dist\*.blockmap

node -e "var f='package.json',fs=require('fs'),p=JSON.parse(fs.readFileSync(f)),v='%VER%'.trim();p.version=v;p.build.productName='kwirth-magnify-'+v+'-e';fs.writeFileSync(f,JSON.stringify(p,null,'\t'))"

call npm run dist
move dist\*.exe \github\releases

wsl -d alpine sh -c "npm run dist:linux"
move dist\*.AppImage \github\releases
