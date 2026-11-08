#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of nerdctl-build.cmd
git clone https://github.com/containerd/nerdctl.git
cd nerdctl
docker build -t kwirthmagnify/nerdctl .
docker push kwirthmagnify/nerdctl
