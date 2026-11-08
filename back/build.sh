#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of build.cmd: bumps the version, builds front and back, and spreads the bundle to
# every deploy target (electron, external, docker).

../version/update-version.sh

cp ../version/version.ts ../back/src
cp ../version/version.ts ../front/src
cp ../version/version.js ../deploy/electron

# clean targets
for d in dist/front bundle front ../deploy/electron/bundle ../deploy/external/bundle ../docker/bundle; do
    rm -rf "$d"
    mkdir -p "$d"
done

# build front (ts) and copy to targets
(cd ../front && npm run build)

# bring front SPA here (inside BACK)
cp -r ../front/build/. ./dist/front/
cp -r ../front/build/. ./front/
mkdir -p ./bundle/front
cp -r ../front/build/. ./bundle/front/

# build back
npm run build

cp -r ./bundle/. ../deploy/electron/bundle/
cp -r ./bundle/. ../deploy/external/bundle/
cp -r ./bundle/. ../docker/bundle/
cp ./package*.json ../docker/
