#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

helm uninstall kwirth -n kwirth
