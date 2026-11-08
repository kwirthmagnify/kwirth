#!/usr/bin/env bash
set -euo pipefail
# ============================================================
#  Linux equivalent of syslog-replay-in-cluster.cmd
#  Replay syslog capture from inside the cluster.
#  Sends to ClusterIP (not DNS) to avoid per-message DNS lookup.
#  Every setting below can be overridden from the environment.
# ============================================================

# === CONFIGURE ===
CAPTURE_FILE="${CAPTURE_FILE:-checkpoint_udp_9001_raw_20260612_112128.log}"
MONTAG_AGENT_NS="${MONTAG_AGENT_NS:-default}"
SYSLOG_PORT="${SYSLOG_PORT:-514}"
SPEED="${SPEED:-0}"
SCRIPT_DIR="${SCRIPT_DIR:-$HOME/gitlab/kwirth-pro/scripts}"
CAPTURE_DIR="${CAPTURE_DIR:-/tmp}"
POD="${POD:-syslog-sender}"

echo
echo "Capture : $CAPTURE_DIR/$CAPTURE_FILE"
echo "Port    : $SYSLOG_PORT  (speed=$SPEED)"
echo

cleanup() {
    echo
    echo "Cleaning up..."
    kubectl delete pod "$POD" -n "$MONTAG_AGENT_NS" --now 2>/dev/null || true
}
trap cleanup EXIT

# --- Create pod ---
kubectl run "$POD" -n "$MONTAG_AGENT_NS" --image=node:20-alpine --restart=Never --command -- sleep 7200 2>/dev/null || true
kubectl wait --for=condition=Ready "pod/$POD" -n "$MONTAG_AGENT_NS" --timeout=120s || { echo "ERROR: pod did not become Ready"; exit 1; }

# --- Resolve ClusterIP once (avoids per-message DNS lookup inside pod) ---
SYSLOG_IP=$(kubectl get svc montag-agent -n "$MONTAG_AGENT_NS" -o jsonpath='{.spec.clusterIP}')
echo "ClusterIP: $SYSLOG_IP"

# --- Copy script (small, ~fast) ---
echo "Copying script..."
(cd "$SCRIPT_DIR" && kubectl cp syslog-replay-same-socket.mjs "$POD:/tmp/syslog-replay.mjs" -n "$MONTAG_AGENT_NS") || { echo "ERROR: script copy failed"; exit 1; }

# --- Copy capture file (~1 min) ---
echo "Copying capture file, please wait..."
(cd "$CAPTURE_DIR" && kubectl cp "$CAPTURE_FILE" "$POD:/tmp/capture.log" -n "$MONTAG_AGENT_NS") || { echo "ERROR: capture copy failed"; exit 1; }

# --- Run replay pointing to ClusterIP ---
echo
echo "Sending to $SYSLOG_IP:$SYSLOG_PORT ..."
kubectl exec "$POD" -n "$MONTAG_AGENT_NS" -- node /tmp/syslog-replay.mjs /tmp/capture.log "$SYSLOG_IP:$SYSLOG_PORT" --speed "$SPEED"
