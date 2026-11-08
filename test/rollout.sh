#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

kubectl config use-context k3d-kwirth
kubectl rollout restart deployment kwirth -n kwirth
