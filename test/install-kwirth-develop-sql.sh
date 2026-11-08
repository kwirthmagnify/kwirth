#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Installs Kwirth develop (install-kwirth-develop.sh) and points it to the PostgreSQL running on the host
# machine (systemd), which k3d reaches as host.k3d.internal.
# The password is read from ~/.config/kwirth/sql-password (KWIRTH_SQL_PASSWORD_FILE overrides it) and
# stored in the 'kwirth-sql' Secret.

SQL_PASSWORD_FILE="${KWIRTH_SQL_PASSWORD_FILE:-$HOME/.config/kwirth/sql-password}"
if [ ! -s "$SQL_PASSWORD_FILE" ]; then
    echo "No PostgreSQL password found in $SQL_PASSWORD_FILE"
    exit 1
fi

./install-kwirth-develop.sh

kubectl -n kwirth create secret generic kwirth-sql \
    --from-file=KWIRTH_SQL_PASSWORD="$SQL_PASSWORD_FILE" \
    --dry-run=client -o yaml | kubectl apply -f -

kubectl -n kwirth set env deployment/kwirth \
    KWIRTH_SQL_HOST=host.k3d.internal \
    KWIRTH_SQL_PORT=5432 \
    KWIRTH_SQL_USER=postgres
kubectl -n kwirth set env deployment/kwirth --from=secret/kwirth-sql

# host.k3d.internal is NOT resolved through the cluster DNS: k3d injects it into CoreDNS only on 'k3d cluster
# start', and k3s rewrites that table with its node list (after a reboot, for instance), dropping it. The k3d
# nodes keep it in their own /etc/hosts, so the IP is read from there and pinned in the pod as a hostAlias.
HOST_IP=$(docker exec k3d-kwirth-server-0 cat /etc/hosts | awk '$2 == "host.k3d.internal" { print $1; exit }')
if [ -z "$HOST_IP" ]; then
    echo "host.k3d.internal not found in the /etc/hosts of k3d-kwirth-server-0"
    exit 1
fi
kubectl -n kwirth patch deployment kwirth -p "{\"spec\":{\"template\":{\"spec\":{\"hostAliases\":[{\"ip\":\"$HOST_IP\",\"hostnames\":[\"host.k3d.internal\"]}]}}}}"
