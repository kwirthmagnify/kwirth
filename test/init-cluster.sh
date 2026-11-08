#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# stop/delete fail when the cluster does not exist yet: ignore those errors
k3d cluster stop kwirth || true
k3d cluster delete kwirth || true
k3d cluster create kwirth -p "80:80@loadbalancer" -p "443:443@loadbalancer" -p "8080:8080@loadbalancer" -p "15514:30514/udp@loadbalancer" --k3s-arg "--disable=traefik@server:*" -a 1

kubectl config use-context k3d-kwirth

sleep 5
# deploy an ingress controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.12.2/deploy/static/provider/cloud/deploy.yaml
