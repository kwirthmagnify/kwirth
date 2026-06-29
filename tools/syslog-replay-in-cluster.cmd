@echo off
setlocal

REM ============================================================
REM  Replay syslog capture from inside the cluster.
REM  Sends to ClusterIP (not DNS) to avoid per-message DNS lookup.
REM ============================================================

REM === CONFIGURE ===
set CAPTURE_FILE=checkpoint_udp_9001_raw_20260612_112128.log
set MONTAG_AGENT_NS=default
set SYSLOG_PORT=514
set SPEED=0
set SCRIPT_DIR=c:\gitlab\kwirth-pro\scripts
set CAPTURE_DIR=c:\tmp
set POD=syslog-sender

echo.
echo Capture : %CAPTURE_DIR%\%CAPTURE_FILE%
echo Port    : %SYSLOG_PORT%  (speed=%SPEED%)
echo.

REM --- Create pod ---
kubectl run %POD% -n %MONTAG_AGENT_NS% --image=node:20-alpine --restart=Never --command -- sleep 7200 2>nul
kubectl wait --for=condition=Ready pod/%POD% -n %MONTAG_AGENT_NS% --timeout=120s
if errorlevel 1 ( echo ERROR: pod did not become Ready && goto cleanup )

REM --- Resolve ClusterIP once (avoids per-message DNS lookup inside pod) ---
for /f %%i in ('kubectl get svc montag-agent -n %MONTAG_AGENT_NS% -o jsonpath^={.spec.clusterIP}') do set SYSLOG_IP=%%i
echo ClusterIP: %SYSLOG_IP%

REM --- Copy script (small, ~fast) ---
echo Copying script...
pushd %SCRIPT_DIR%
kubectl cp syslog-replay-same-socket.mjs %POD%:/tmp/syslog-replay.mjs -n %MONTAG_AGENT_NS%
popd
if errorlevel 1 ( echo ERROR: script copy failed && goto cleanup )

REM --- Copy capture file (~1 min) ---
echo Copying capture file, please wait...
pushd %CAPTURE_DIR%
kubectl cp %CAPTURE_FILE% %POD%:/tmp/capture.log -n %MONTAG_AGENT_NS%
popd
if errorlevel 1 ( echo ERROR: capture copy failed && goto cleanup )

REM --- Run replay pointing to ClusterIP ---
echo.
echo Sending to %SYSLOG_IP%:%SYSLOG_PORT% ...
kubectl exec %POD% -n %MONTAG_AGENT_NS% -- node /tmp/syslog-replay.mjs /tmp/capture.log %SYSLOG_IP%:%SYSLOG_PORT% --speed %SPEED%

:cleanup
echo.
echo Cleaning up...
kubectl delete pod %POD% -n %MONTAG_AGENT_NS% --now 2>nul
endlocal
