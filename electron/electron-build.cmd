call ..\version\version.cmd

del \github\releases\*.exe
del \github\releases\*.exe.blockmap
del \github\releases\*.AppImage

call npm run dist -- -c.extraMetadata.version=%KWIRTH_VERSION%
move dist\*.exe \github\releases

wsl -d alpine sh -c "KWIRTH_VERSION=%KWIRTH_VERSION% && npm run dist:linux -- -c.extraMetadata.version=%KWIRTH_VERSION%"
move dist\*.AppImage \github\releases
