#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of create-avicii.cmd
node create-pack.mjs avicii-ui --include theme:avicii --include homepage:avicii --name avicii-ui --version "1.0.0" --description "Avicii homepage & theme"
