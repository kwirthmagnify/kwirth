#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

helm install kwirth kwirth/kwirth -n kwirth --create-namespace -f helm-install-kwirth-values-agic.yaml
