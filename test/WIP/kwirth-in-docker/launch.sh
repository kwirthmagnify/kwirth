#!/usr/bin/env bash
set -euo pipefail
# Linux equivalent of launch.cmd. KWIRTH_DOCKER_DIR holds configmaps/ and secrets/ (c:\temp\kwirthdocker on Windows).
KWIRTH_DOCKER_DIR="${KWIRTH_DOCKER_DIR:-/tmp/kwirthdocker}"
mkdir -p "$KWIRTH_DOCKER_DIR/configmaps" "$KWIRTH_DOCKER_DIR/secrets"
# docker run -p 3883:3883 -v "$KWIRTH_DOCKER_DIR/configmaps:/configmaps" -v "$KWIRTH_DOCKER_DIR/secrets:/secrets" kwirth
docker run -p 3884:3883 -e ROOTPATH="/kwirth" -v "$KWIRTH_DOCKER_DIR/configmaps:/configmaps" -v "$KWIRTH_DOCKER_DIR/secrets:/secrets" -v /var/run/docker.sock:/var/run/docker.sock kwirth
