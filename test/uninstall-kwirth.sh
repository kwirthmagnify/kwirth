#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

kubectl config use-context k3d-kwirth
kubectl delete -f ./kwirth-users-secret.yaml
kubectl delete -f ./kwirth-local-k3d.yaml
kubectl delete -f ./service-and-ingress.yaml
