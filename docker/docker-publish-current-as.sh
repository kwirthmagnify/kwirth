#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of docker-publish-current-as.cmd
# Usage: ./docker-publish-current-as.sh <tag>      e.g. ./docker-publish-current-as.sh latest

[ $# -ge 1 ] || { echo "Usage: $0 <tag>"; exit 1; }
TAG="$1"

major=$(tr -d '[:space:]' < ../version/major)
minor=$(tr -d '[:space:]' < ../version/minor)
level=$(tr -d '[:space:]' < ../version/level)
currentversion="$major.$minor.$level"

# The -full variant is what gets published: Docker Hub keeps carrying the plain `kwirth:<version>`
# and `kwirth:<name>` tags it has always carried, and those are the complete image.
docker tag "kwirth:$currentversion-core" "kwirthmagnify/kwirth:$currentversion-core"
docker tag "kwirth:$currentversion-readonly" "kwirthmagnify/kwirth:$currentversion-readonly"
docker tag "kwirth:$currentversion-full" "kwirthmagnify/kwirth:$currentversion-full"
docker tag "kwirth:$currentversion-full" "kwirthmagnify/kwirth:$TAG"
docker tag "kwirth:$currentversion-full" "kwirthmagnify/kwirth:$currentversion"
docker push "kwirthmagnify/kwirth:$TAG"
docker push "kwirthmagnify/kwirth:$currentversion"
docker push "kwirthmagnify/kwirth:$currentversion-core"
docker push "kwirthmagnify/kwirth:$currentversion-readonly"
docker push "kwirthmagnify/kwirth:$currentversion-full"
