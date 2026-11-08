#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

kubectl config use-context k3d-kwirth
kubectl apply -f ./kwirth-users-secret.yaml
kubectl apply -f ./kwirth-develop.yaml
kubectl apply -f ./service-and-ingress.yaml
