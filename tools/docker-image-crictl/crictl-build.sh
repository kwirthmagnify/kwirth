#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of crictl-build.cmd
docker build . -t kwirthmagnify/crictl:1.35.0
