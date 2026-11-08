#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

kubectl config use-context k3d-kwirth

# import the current build (the -full variant, the one carrying every bundled extension) into k3d as kwirth:latest
major=$(tr -d '[:space:]' < ../version/major)
minor=$(tr -d '[:space:]' < ../version/minor)
level=$(tr -d '[:space:]' < ../version/level)
currentversion="$major.$minor.$level"
docker rmi kwirth:latest || true
docker tag "kwirth:$currentversion-full" kwirth:latest
k3d image import kwirth:latest -c kwirth

kubectl delete -f ./kwirth-local-k3d.yaml || true
sleep 3
kubectl apply -f ./kwirth-local-k3d.yaml
