#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of launch.cmd
docker compose -p julio up
