#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of create-censor.cmd
node create-pack.mjs censor --include plugin:censor --include login:censor --name "Censor" --version "0.1.4" --description "Censor pack for Kwirth - LLM-based log noise filtering channel plus its custom login page" --website "https://kwirthmagnify.dev"
