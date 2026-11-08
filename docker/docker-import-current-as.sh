#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of docker-import-current-as.cmd: tags the current -full image as kwirth:<tag> and
# imports it into the k3d cluster 'kwirth'.
# Usage: ./docker-import-current-as.sh <tag>      e.g. ./docker-import-current-as.sh develop

if [ $# -lt 1 ]; then
    echo "Usage: $0 <tag>"
    exit 1
fi
TAG="$1"

major=$(tr -d '[:space:]' < ../version/major)
minor=$(tr -d '[:space:]' < ../version/minor)
level=$(tr -d '[:space:]' < ../version/level)
currentversion="$major.$minor.$level"

# The -full variant is the one that gets imported: it is the only one that carries every bundled
# extension, so it is the one worth testing in a cluster.
docker rmi kwirth:latest || true
docker tag "kwirth:$currentversion-full" "kwirth:$TAG"
k3d image import "kwirth:$TAG" -c kwirth
