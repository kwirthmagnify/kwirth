<#
    Kwirth with Docker Compose: install, update, stop and remove, in one command each.
    Windows (PowerShell 5.1 or 7). On Linux, macOS and WSL, install.sh does the same.

      .\install.ps1 up [-Sql] [-Kubeconfig PATH] [-Watchtower] [-ScanRunner IMAGE] [-Tag TAG] [-Port N] [-Bind ADDR]
      .\install.ps1 update      pull the image of the tag and recreate what changed
      .\install.ps1 status      what is running and how it is
      .\install.ps1 logs        follow Kwirth's log
      .\install.ps1 down        stop and remove the containers; the data stays in its volumes
      .\install.ps1 destroy     the same AND the volumes: every user, setting and database is lost

    The first 'up' writes .env with a new MASTERKEY (and a database password with -Sql). It is never
    overwritten after that: the options given to later runs only change the lines they name. The add-ons in
    use are remembered in .env as COMPOSE_FILE, so a plain 'docker compose up -d' in this folder does the same.
    -NoSql, -NoKubeconfig, -NoWatchtower and -NoScanRunner remove an add-on chosen before.
#>
param(
    [Parameter(Position = 0)]
    [ValidateSet('up', 'update', 'status', 'logs', 'down', 'destroy', 'help')]
    [string]$Command = 'help',
    [switch]$Sql,
    [switch]$NoSql,
    [string]$Kubeconfig,
    [switch]$NoKubeconfig,
    [switch]$Watchtower,
    [switch]$NoWatchtower,
    [string]$ScanRunner,
    [switch]$NoScanRunner,
    [string]$Tag,
    [string]$Port,
    [string]$Bind
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$EnvFile = Join-Path $PSScriptRoot '.env'
$HealthTimeout = 180

function Fail([string]$message) {
    Write-Host "ERROR: $message" -ForegroundColor Red
    exit 1
}

# Native commands do not throw on a non-zero exit code in PowerShell 5.1: every call is checked by hand.
function Invoke-Docker([string[]]$arguments) {
    & docker @arguments
    if ($LASTEXITCODE -ne 0) { Fail "docker $($arguments -join ' ') failed" }
}

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'docker is not installed or not in PATH' }
    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { Fail "'docker compose' is not available (Docker Compose v2 is needed)" }
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'the Docker daemon is not running (start Docker Desktop)' }
}

function New-RandomHex {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Read-EnvLines {
    if (Test-Path $EnvFile) { return @(Get-Content -Path $EnvFile) }
    return @()
}

function Get-EnvValue([string]$key) {
    $line = Read-EnvLines | Where-Object { $_ -match "^$key=" } | Select-Object -Last 1
    if ($null -eq $line) { return '' }
    return $line.Substring($key.Length + 1)
}

# Written without BOM and with LF: docker compose reads .env byte by byte, and a BOM would turn the first
# key into a different one.
function Write-EnvLines([string[]]$lines) {
    $text = ($lines -join "`n") + "`n"
    [System.IO.File]::WriteAllText($EnvFile, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Set-EnvValue([string]$key, [string]$value) {
    $lines = @(Read-EnvLines | Where-Object { $_ -notmatch "^$key=" })
    $lines += "$key=$value"
    Write-EnvLines $lines
}

# For the secrets: generated once and never replaced.
function Set-EnvValueOnce([string]$key, [string]$value) {
    if ((Get-EnvValue $key) -eq '') { Set-EnvValue $key $value }
}

function Test-ComposeFile([string]$name) {
    return (",$(Get-EnvValue 'COMPOSE_FILE')," -like "*,$name,*")
}

function Wait-Healthy {
    Write-Host "Waiting for Kwirth to be healthy (up to ${HealthTimeout}s)..."
    $deadline = (Get-Date).AddSeconds($HealthTimeout)
    while ((Get-Date) -lt $deadline) {
        $id = (& docker compose ps -q kwirth 2>$null)
        if ($id) {
            $health = (& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $id 2>$null)
            if ($health -eq 'healthy') { return }
        }
        Start-Sleep -Seconds 3
    }
    Write-Host "Kwirth is not healthy after ${HealthTimeout}s. Its last log lines:" -ForegroundColor Red
    & docker compose logs --tail 40 kwirth
    exit 1
}

function Show-Access {
    $address = Get-EnvValue 'KWIRTH_BIND'
    $listen = Get-EnvValue 'KWIRTH_PORT'
    if ($address -eq '' -or $address -eq '0.0.0.0') { $address = 'localhost' }
    if ($listen -eq '') { $listen = '3883' }
    Write-Host ''
    Write-Host "Kwirth is up:  http://${address}:${listen}" -ForegroundColor Green
    Write-Host 'First login:   admin / password  (change it right away)'
    if (Test-ComposeFile 'docker-compose.scan-runner.yml') {
        Write-Host ''
        Write-Host "Scan runner:   in the extension's settings, URL http://scan-runner:8080"
        Write-Host "               and the token SCAN_RUNNER_TOKEN from $EnvFile"
    }
    Write-Host ''
    Write-Host "Keep a copy of $EnvFile somewhere safe: its MASTERKEY is the only key to the stored data." -ForegroundColor Yellow
}

function Invoke-Up {
    $useSql = Test-ComposeFile 'docker-compose.sql.yml'
    $useKube = Test-ComposeFile 'docker-compose.kubeconfig.yml'
    $useWatch = Test-ComposeFile 'docker-compose.watchtower.yml'
    $useRunner = Test-ComposeFile 'docker-compose.scan-runner.yml'

    if ($Sql) { $useSql = $true }
    if ($NoSql) { $useSql = $false }
    if ($Kubeconfig) {
        if (-not (Test-Path $Kubeconfig -PathType Leaf)) { Fail "kubeconfig not found: $Kubeconfig" }
        $useKube = $true
        # Forward slashes: compose takes C:/Users/... as a bind source on Docker Desktop.
        Set-EnvValue 'KUBECONFIG_PATH' ((Resolve-Path $Kubeconfig).Path -replace '\\', '/')
    }
    if ($NoKubeconfig) { $useKube = $false }
    if ($Watchtower) { $useWatch = $true }
    if ($NoWatchtower) { $useWatch = $false }
    if ($ScanRunner) {
        $useRunner = $true
        Set-EnvValue 'SCAN_RUNNER_IMAGE' $ScanRunner
    }
    if ($NoScanRunner) { $useRunner = $false }
    if ($Tag) { Set-EnvValue 'KWIRTH_TAG' $Tag }
    if ($Port) { Set-EnvValue 'KWIRTH_PORT' $Port }
    if ($Bind) { Set-EnvValue 'KWIRTH_BIND' $Bind }

    if (-not (Test-Path $EnvFile)) { Write-Host "Creating .env with a new MASTERKEY" }
    Set-EnvValueOnce 'KWIRTH_TAG' 'latest'
    Set-EnvValueOnce 'KWIRTH_BIND' '127.0.0.1'
    Set-EnvValueOnce 'KWIRTH_PORT' '3883'
    Set-EnvValueOnce 'KWIRTH_CLUSTER_NAME' 'compose'
    Set-EnvValueOnce 'MASTERKEY' (New-RandomHex)
    if ($useSql) { Set-EnvValueOnce 'KWIRTH_SQL_PASSWORD' (New-RandomHex) }
    if ($useRunner) {
        if ((Get-EnvValue 'SCAN_RUNNER_IMAGE') -eq '') { Fail 'the scan runner needs its image: -ScanRunner IMAGE' }
        Set-EnvValueOnce 'SCAN_RUNNER_TOKEN' (New-RandomHex)
    }

    $files = @('docker-compose.yml')
    if ($useSql) { $files += 'docker-compose.sql.yml' }
    if ($useKube) { $files += 'docker-compose.kubeconfig.yml' }
    if ($useWatch) { $files += 'docker-compose.watchtower.yml' }
    if ($useRunner) { $files += 'docker-compose.scan-runner.yml' }
    Set-EnvValue 'COMPOSE_PATH_SEPARATOR' ','
    Set-EnvValue 'COMPOSE_FILE' ($files -join ',')

    Write-Host "Files: $($files -join ',')"
    Invoke-Docker @('compose', 'pull')
    Invoke-Docker @('compose', 'up', '-d', '--remove-orphans')
    Wait-Healthy
    Show-Access
}

function Invoke-Update {
    if (-not (Test-Path $EnvFile)) { Fail "no .env here: run '.\install.ps1 up' first" }
    Invoke-Docker @('compose', 'pull')
    Invoke-Docker @('compose', 'up', '-d', '--remove-orphans')
    Wait-Healthy
    Show-Access
}

function Invoke-Destroy {
    Write-Host 'This removes the containers AND the volumes: every user, setting, extension and database is lost.' -ForegroundColor Yellow
    $answer = Read-Host "Type 'destroy' to confirm"
    if ($answer -ne 'destroy') { Fail 'not confirmed, nothing removed' }
    Invoke-Docker @('compose', 'down', '-v', '--remove-orphans')
    Write-Host 'Removed. .env is kept; delete it by hand if you are not reinstalling.'
}

if ($Command -eq 'help') {
    # The comment block at the top, without its '<#' and '#>' lines.
    (Get-Content -Path $PSCommandPath -TotalCount 15 | Select-Object -Skip 1) -join "`n" | Write-Host
    exit 0
}

Assert-Docker

switch ($Command) {
    'up' { Invoke-Up }
    'update' { Invoke-Update }
    'status' { Invoke-Docker @('compose', 'ps') }
    'logs' { & docker compose logs -f --tail 100 kwirth }
    'down' { Invoke-Docker @('compose', 'down', '--remove-orphans') }
    'destroy' { Invoke-Destroy }
}
