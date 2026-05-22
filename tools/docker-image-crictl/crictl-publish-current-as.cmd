set currentversion=1.35.0

docker build . -t kwirthmagnify/crictl:%currentversion% -t kwirthmagnify/crictl:%1
docker push kwirthmagnify/crictl:%1
docker push kwirthmagnify/crictl:%currentversion%
