#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Linux equivalent of publish-chart.cmd
helm package ./0.1.0
helm package ./0.1.1
helm package ./0.1.2
helm package ./0.1.3
helm package ./0.1.4
helm package ./0.1.5

helm repo index . --url https://kwirthmagnify.github.io/kwirth/helm-charts

mkdir -p ../../docs/helm-charts
mv -f ./*.tgz ../../docs/helm-charts/
mv -f index.yaml ../../docs/helm-charts/
