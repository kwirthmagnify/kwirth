set /p major=<..\version\major
set /p minor=<..\version\minor
set /p level=<..\version\level
set currentversion=%major%.%minor%.%level%

docker build . -t kwirth -t kwirthmagnify/kwirth:%currentversion% -t  kwirthmagnify/kwirth:%1
docker push kwirthmagnify/kwirth:%1
docker push kwirthmagnify/kwirth:%currentversion%
