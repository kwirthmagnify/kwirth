#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

kubectl config use-context k3d-kwirth

# import the current build (the -full variant) into k3d as kwirth:latest
../docker/docker-import-current-as.sh latest

kubectl delete -f ./kwirth-local-k3d.yaml || true
sleep 3
kubectl apply -f ./kwirth-local-k3d.yaml
