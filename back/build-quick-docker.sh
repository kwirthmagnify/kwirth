#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of build-quick-docker.cmd: rebuilds only the back (no version bump, no front build)
# and the docker images.

docker rmi kwirth:latest --force || true
rm -rf ../docker/bundle
mkdir -p ../docker/bundle

mkdir -p ./dist/front
cp -r ../front/build/. ./dist/front/
npm run build
cp -r ./bundle/. ../docker/bundle/

../docker/docker-build.sh
