set /p major=<..\version\major
set /p minor=<..\version\minor
set /p level=<..\version\level
rem the level file ends in a space ("73 "): without this, "kwirth:%currentversion%-full" became two arguments
set level=%level: =%
set currentversion=%major%.%minor%.%level%

rem The -full variant is what gets published: Docker Hub keeps carrying the plain `kwirth:<version>`
rem and `kwirth:<name>` tags it has always carried, and those are the complete image.
docker tag kwirth:%currentversion%-full kwirthmagnify/kwirth:%1
docker tag kwirth:%currentversion%-full kwirthmagnify/kwirth:%currentversion%
docker push kwirthmagnify/kwirth:%1
docker push kwirthmagnify/kwirth:%currentversion%
