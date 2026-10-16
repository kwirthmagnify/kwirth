#!/bin/sh
# Kwirth with Docker Compose: install, update, stop and remove, in one command each.
# Linux, macOS and WSL. On Windows, install.ps1 does the same.
#
#   ./install.sh up [--sql] [--kubeconfig PATH] [--watchtower] [--scan-runner IMAGE] [--tag TAG] [--port N] [--bind ADDR]
#   ./install.sh update      pull the image of the tag and recreate what changed
#   ./install.sh status      what is running and how it is
#   ./install.sh logs        follow Kwirth's log
#   ./install.sh down        stop and remove the containers; the data stays in its volumes
#   ./install.sh destroy     the same AND the volumes: every user, setting and database is lost
#
# The first 'up' writes .env with a new MASTERKEY (and a database password with --sql). It is never
# overwritten after that: the options given to later runs only change the lines they name. The add-ons in
# use are remembered in .env as COMPOSE_FILE, so a plain 'docker compose up -d' in this folder does the same.

set -eu

cd "$(dirname "$0")"

ENV_FILE=.env
HEALTH_TIMEOUT=180

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

need_docker() {
    command -v docker >/dev/null 2>&1 || fail "docker is not installed or not in PATH"
    docker compose version >/dev/null 2>&1 || fail "'docker compose' is not available (Docker Compose v2 is needed)"
    docker info >/dev/null 2>&1 || fail "the Docker daemon is not running, or this user cannot reach it"
}

random_hex() {
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32
    else
        head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
    fi
}

# The value of KEY in .env, or nothing.
get_env() {
    [ -f "$ENV_FILE" ] || return 0
    grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-
}

# Sets KEY=VALUE in .env, replacing the line if it is there. A temp file, not 'sed -i': its flags differ
# between GNU and BSD (macOS).
set_env() {
    tmp="$ENV_FILE.tmp"
    if [ -f "$ENV_FILE" ]; then
        grep -v -E "^$1=" "$ENV_FILE" > "$tmp" || true
    else
        : > "$tmp"
    fi
    echo "$1=$2" >> "$tmp"
    mv "$tmp" "$ENV_FILE"
}

# Sets KEY only if it is not set yet. For the secrets: they are generated once and never replaced.
set_env_once() {
    [ -n "$(get_env "$1")" ] || set_env "$1" "$2"
}

compose_files() {
    files="docker-compose.yml"
    [ "$1" = "yes" ] && files="$files,docker-compose.sql.yml"
    [ "$2" = "yes" ] && files="$files,docker-compose.kubeconfig.yml"
    [ "$3" = "yes" ] && files="$files,docker-compose.watchtower.yml"
    [ "$4" = "yes" ] && files="$files,docker-compose.scan-runner.yml"
    echo "$files"
}

has_file() {
    case ",$(get_env COMPOSE_FILE)," in
        *",$1,"*) echo yes ;;
        *) echo no ;;
    esac
}

wait_healthy() {
    echo "Waiting for Kwirth to be healthy (up to ${HEALTH_TIMEOUT}s)..."
    elapsed=0
    while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
        id="$(docker compose ps -q kwirth 2>/dev/null || true)"
        if [ -n "$id" ]; then
            health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
            [ "$health" = "healthy" ] && return 0
        fi
        sleep 3
        elapsed=$((elapsed + 3))
    done
    echo "Kwirth is not healthy after ${HEALTH_TIMEOUT}s. Its last log lines:" >&2
    docker compose logs --tail 40 kwirth >&2 || true
    return 1
}

print_access() {
    bind="$(get_env KWIRTH_BIND)"
    port="$(get_env KWIRTH_PORT)"
    [ -n "$bind" ] || bind=127.0.0.1
    [ -n "$port" ] || port=3883
    [ "$bind" = "0.0.0.0" ] && bind=localhost
    echo
    echo "Kwirth is up:  http://$bind:$port"
    echo "First login:   admin / password  (change it right away)"
    echo
    if [ "$(has_file docker-compose.scan-runner.yml)" = "yes" ]; then
        echo
        echo "Scan runner:   in the extension's settings, URL http://scan-runner:8080"
        echo "               and the token SCAN_RUNNER_TOKEN from $(pwd)/$ENV_FILE"
    fi
    echo
    echo "Keep a copy of $(pwd)/$ENV_FILE somewhere safe: its MASTERKEY is the only key to the stored data."
}

cmd_up() {
    sql=$(has_file docker-compose.sql.yml)
    kube=$(has_file docker-compose.kubeconfig.yml)
    watch=$(has_file docker-compose.watchtower.yml)
    runner=$(has_file docker-compose.scan-runner.yml)
    while [ $# -gt 0 ]; do
        case "$1" in
            --sql) sql=yes ;;
            --no-sql) sql=no ;;
            --kubeconfig)
                [ $# -ge 2 ] || fail "--kubeconfig needs the path of a kubeconfig"
                [ -f "$2" ] || fail "kubeconfig not found: $2"
                kube=yes
                set_env KUBECONFIG_PATH "$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
                shift ;;
            --no-kubeconfig) kube=no ;;
            --watchtower) watch=yes ;;
            --no-watchtower) watch=no ;;
            --scan-runner)
                [ $# -ge 2 ] || fail "--scan-runner needs the image of the scan runner"
                runner=yes
                set_env SCAN_RUNNER_IMAGE "$2"
                shift ;;
            --no-scan-runner) runner=no ;;
            --tag)
                [ $# -ge 2 ] || fail "--tag needs a value"
                set_env KWIRTH_TAG "$2"
                shift ;;
            --port)
                [ $# -ge 2 ] || fail "--port needs a value"
                set_env KWIRTH_PORT "$2"
                shift ;;
            --bind)
                [ $# -ge 2 ] || fail "--bind needs a value"
                set_env KWIRTH_BIND "$2"
                shift ;;
            *) fail "unknown option for up: $1" ;;
        esac
        shift
    done

    if [ ! -f "$ENV_FILE" ]; then
        echo "Creating $ENV_FILE with a new MASTERKEY"
    fi
    set_env_once KWIRTH_TAG latest
    set_env_once KWIRTH_BIND 127.0.0.1
    set_env_once KWIRTH_PORT 3883
    set_env_once KWIRTH_CLUSTER_NAME compose
    set_env_once MASTERKEY "$(random_hex)"
    [ "$sql" = "yes" ] && set_env_once KWIRTH_SQL_PASSWORD "$(random_hex)"
    if [ "$runner" = "yes" ]; then
        [ -n "$(get_env SCAN_RUNNER_IMAGE)" ] || fail "the scan runner needs its image: --scan-runner IMAGE"
        set_env_once SCAN_RUNNER_TOKEN "$(random_hex)"
    fi
    set_env COMPOSE_PATH_SEPARATOR ,
    set_env COMPOSE_FILE "$(compose_files "$sql" "$kube" "$watch" "$runner")"
    chmod 600 "$ENV_FILE"

    echo "Files: $(get_env COMPOSE_FILE)"
    docker compose pull
    docker compose up -d --remove-orphans
    wait_healthy
    print_access
}

cmd_update() {
    [ -f "$ENV_FILE" ] || fail "no $ENV_FILE here: run '$0 up' first"
    docker compose pull
    docker compose up -d --remove-orphans
    wait_healthy
    print_access
}

cmd_destroy() {
    echo "This removes the containers AND the volumes: every user, setting, extension and database is lost."
    printf "Type 'destroy' to confirm: "
    read -r answer
    [ "$answer" = "destroy" ] || fail "not confirmed, nothing removed"
    docker compose down -v --remove-orphans
    echo "Removed. $ENV_FILE is kept; delete it by hand if you are not reinstalling."
}

usage() {
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
}

[ $# -ge 1 ] || { usage; exit 1; }
command="$1"
shift

case "$command" in
    -h|--help|help) usage; exit 0 ;;
esac

need_docker

case "$command" in
    up) cmd_up "$@" ;;
    update) cmd_update ;;
    status) docker compose ps ;;
    logs) docker compose logs -f --tail 100 kwirth ;;
    down) docker compose down --remove-orphans ;;
    destroy) cmd_destroy ;;
    *) usage; exit 1 ;;
esac
