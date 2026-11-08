#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of crictl-publish-current-as.cmd
# Usage: ./crictl-publish-current-as.sh <tag>
[ $# -ge 1 ] || { echo "Usage: $0 <tag>"; exit 1; }
currentversion=1.35.0

docker build . -t "kwirthmagnify/crictl:$currentversion" -t "kwirthmagnify/crictl:$1"
docker push "kwirthmagnify/crictl:$1"
docker push "kwirthmagnify/crictl:$currentversion"
