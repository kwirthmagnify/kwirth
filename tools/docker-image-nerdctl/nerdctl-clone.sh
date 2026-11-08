#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of nerdctl-clone.cmd
docker pull ghcr.io/containerd/nerdctl:latest
docker tag ghcr.io/containerd/nerdctl:latest kwirthmagnify/nerdctl
docker push kwirthmagnify/nerdctl
