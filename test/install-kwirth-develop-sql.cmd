@echo off
setlocal
rem Installs Kwirth develop (install-kwirth-develop.cmd) and points it to the PostgreSQL running on the host
rem machine, which k3d reaches as host.k3d.internal.
rem The password is read from %USERPROFILE%\.config\kwirth\sql-password (KWIRTH_SQL_PASSWORD_FILE overrides it)
rem and stored in the 'kwirth-sql' Secret.

if "%KWIRTH_SQL_PASSWORD_FILE%"=="" set KWIRTH_SQL_PASSWORD_FILE=%USERPROFILE%\.config\kwirth\sql-password
if not exist "%KWIRTH_SQL_PASSWORD_FILE%" (
    echo No PostgreSQL password found in %KWIRTH_SQL_PASSWORD_FILE%
    exit /b 1
)

call install-kwirth-develop.cmd
if errorlevel 1 exit /b 1

kubectl -n kwirth create secret generic kwirth-sql --from-file=KWIRTH_SQL_PASSWORD="%KWIRTH_SQL_PASSWORD_FILE%" --dry-run=client -o yaml | kubectl apply -f -

kubectl -n kwirth set env deployment/kwirth KWIRTH_SQL_HOST=host.k3d.internal KWIRTH_SQL_PORT=5432 KWIRTH_SQL_USER=postgres
kubectl -n kwirth set env deployment/kwirth --from=secret/kwirth-sql

rem host.k3d.internal is NOT resolved through the cluster DNS: k3d injects it into CoreDNS only on 'k3d cluster
rem start', and k3s rewrites that table with its node list (after a reboot, for instance), dropping it. The k3d
rem nodes keep it in their own /etc/hosts, so the IP is read from there and pinned in the pod as a hostAlias.
set HOST_IP=
for /f "tokens=1,2" %%a in ('docker exec k3d-kwirth-server-0 cat /etc/hosts') do if "%%b"=="host.k3d.internal" set HOST_IP=%%a
if "%HOST_IP%"=="" (
    echo host.k3d.internal not found in the /etc/hosts of k3d-kwirth-server-0
    exit /b 1
)
kubectl -n kwirth patch deployment kwirth -p "{\"spec\":{\"template\":{\"spec\":{\"hostAliases\":[{\"ip\":\"%HOST_IP%\",\"hostnames\":[\"host.k3d.internal\"]}]}}}}"
