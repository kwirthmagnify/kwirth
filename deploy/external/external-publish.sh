#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of external-publish.cmd
# Usage: ./external-publish.sh <npm token>
[ $# -ge 1 ] || { echo "Usage: $0 <npm token>"; exit 1; }
npm publish "--//registry.npmjs.org/:_authToken=$1"
