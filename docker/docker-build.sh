#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of docker-build.cmd

major=$(tr -d '[:space:]' < ../version/major)
minor=$(tr -d '[:space:]' < ../version/minor)
level=$(tr -d '[:space:]' < ../version/level)
currentversion="$major.$minor.$level"

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=0

# Three variants of the SAME core, differing only in which extensions travel inside the image:
#   -core      nothing bundled but the guide
#   -readonly  + plugins log, metrics, alert, echo; providers metrics, events
#   -full      + plugins magnify, fileman, topology; DCEs file-manager, three
# Each one reads its own back/kwirth-bundled-<variant>.json. 'latest' follows -full, which is also
# what docker-import-current-as and docker-publish-current-as work with.
for variant in core readonly full; do
    docker image rm "kwirth:$currentversion-$variant" 2>/dev/null || true
    node build-image.mjs "kwirth:$currentversion-$variant" "kwirth-bundled-$variant.json"
done

docker image rm kwirth:latest 2>/dev/null || true
docker tag "kwirth:$currentversion-full" kwirth:latest
