#!/usr/bin/env bash
set -euo pipefail
# Linux equivalent of docker-launch.cmd. Like the .cmd, the configmaps and secrets live in the CURRENT folder.
docker run -p 3883:3883 -v "$HOME/.kube/config:/root/.kube/config" -v "$(pwd):/root/.kwirth/configmaps" -v "$(pwd):/root/.kwirth/secrets" -e CONFIGMAPPATH=/root/.kwirth/configmaps -e SECRETPATH=/root/.kwirth/secrets kwirth
