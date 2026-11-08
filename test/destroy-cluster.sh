#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

k3d cluster delete kwirth
