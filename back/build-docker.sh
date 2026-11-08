#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of build-docker.cmd
./build.sh
../docker/docker-build.sh
