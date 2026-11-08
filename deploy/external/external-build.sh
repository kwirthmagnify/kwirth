#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of external-build.cmd
mkdir -p dist
cp ../../version/version.js dist
npm run dist
