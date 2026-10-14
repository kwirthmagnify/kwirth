set /p major=<..\version\major
set /p minor=<..\version\minor
set /p level=<..\version\level
rem the level file ends in a space ("73 "): without this, "kwirth:%currentversion%-full" became two arguments
set level=%level: =%
set currentversion=%major%.%minor%.%level%

rem The -full variant is the one that gets imported: it is the only one that carries every bundled
rem extension, so it is the one worth testing in a cluster.
docker rmi kwirth:latest
docker tag kwirth:%currentversion%-full kwirth:%1
k3d image import kwirth:%1 -c kwirth
