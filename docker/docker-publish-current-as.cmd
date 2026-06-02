set /p major=<..\version\major
set /p minor=<..\version\minor
set /p level=<..\version\level
set currentversion=%major%.%minor%.%level%

docker tag kwirth:%CURRENTVERSION% kwirthmagnify/kwirth:%1
docker tag kwirth:%CURRENTVERSION% kwirthmagnify/kwirth:%CURRENTVERSION%
docker push kwirthmagnify/kwirth:%1
docker push kwirthmagnify/kwirth:%currentversion%
