call ..\version\version.cmd
call npm run dist -- -c.extraMetadata.version=%KWIRTH_VERSION%

wsl -d alpine sh -c "cd /mnt/c/Users/julio.fernandezvila/source/repos/jfvilas/kwirth/electron && KWIRTH_VERSION=%KWIRTH_VERSION% && npm run dist:linux -- -c.extraMetadata.version=%KWIRTH_VERSION%"
