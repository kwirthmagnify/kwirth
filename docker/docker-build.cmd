set /p major=<..\version\major
set /p minor=<..\version\minor
set /p level=<..\version\level
set currentversion=%major%.%minor%.%level%

set DOCKER_BUILDKIT=1
set COMPOSE_DOCKER_CLI_BUILD=0

rem Three variants of the SAME core, differing only in which extensions travel inside the image:
rem   -core      nothing bundled but the guide
rem   -readonly  + plugins log, metrics, alert, echo; providers metrics, events
rem   -full      + plugins magnify, fileman, topology; DCEs file-manager, three
rem Each one reads its own back\kwirth-bundled-<variant>.json. 'latest' follows -full, which is also
rem what docker-import-current-as and docker-publish-current-as work with.
for %%V in (core readonly full) do (
    docker image rm kwirth:%currentversion%-%%V 2>nul
    node build-image.mjs kwirth:%currentversion%-%%V kwirth-bundled-%%V.json
    if errorlevel 1 exit /b 1
)

docker image rm kwirth:latest 2>nul
docker tag kwirth:%currentversion%-full kwirth:latest
