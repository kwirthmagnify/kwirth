# Kwirth with Docker Compose

Run Kwirth on any machine with Docker — Linux, Windows or macOS — **persistent, with its secrets
encrypted, and optionally with PostgreSQL**, in one command. It is the same image as everywhere else,
`kwirthmagnify/kwirth`; there is no compose-specific build.

What is in this folder:

| file | what it is |
|---|---|
| [`install.sh`](install.sh) · [`install.ps1`](install.ps1) | **start here**: creates `.env`, starts everything, waits until Kwirth is healthy and tells you where to log in. `.sh` for Linux, macOS and WSL; `.ps1` for Windows |
| [`docker-compose.yml`](docker-compose.yml) | the base: Kwirth alone, on `localhost:3883`, with a volume for its store |
| [`docker-compose.sql.yml`](docker-compose.sql.yml) | add-on: PostgreSQL, for the extensions that need a database |
| [`docker-compose.kubeconfig.yml`](docker-compose.kubeconfig.yml) | add-on: mounts a kubeconfig so Kwirth observes a Kubernetes cluster |
| [`docker-compose.watchtower.yml`](docker-compose.watchtower.yml) | add-on: Watchtower, which pulls and restarts Kwirth by itself when its tag gets a new image |
| [`docker-compose.scan-runner.yml`](docker-compose.scan-runner.yml) | add-on: the scan runner, for extensions that scan container images (there are no Kubernetes Jobs here) |
| [`.env.example`](.env.example) | every setting, documented. `install` writes the real `.env` for you |

## Quick start

From this folder. On Linux, macOS or WSL:

```bash
./install.sh up
```

On Windows, in PowerShell:

```powershell
.\install.ps1 up
```

The first run takes a minute or two (it pulls the image). When it finishes it prints:

```
Kwirth is up:  http://127.0.0.1:3883
First login:   admin / password  (change it right away)
```

Open that URL and log in with `admin` / `password`. Kwirth asks for a new password on that first login.

That is the whole installation. What it created:

- **`.env`** in this folder, with a **`MASTERKEY` generated for you** (64 random hex characters). It
  encrypts Kwirth's store and signs its API keys
- the **`kwirth_kwirth-data`** volume, mounted at `/data`, holding users, settings, API keys and installed
  extensions — encrypted with that `MASTERKEY`
- the **`kwirth`** container, published on **`127.0.0.1:3883` only**, with `restart: unless-stopped` and a
  health check against `/healthz`

> 🔴 **Keep a copy of `.env` somewhere safe.** Its `MASTERKEY` is the only key to the data in the volume:
> lose it and Kwirth cannot read its own store again. It lives outside the volume on purpose — a key stored
> next to what it encrypts protects nothing. `.env` is git-ignored; never commit it.

## Options

Everything is an option of `up`, and `up` can be run again at any time to change them. The options you
give are written into `.env`, so later runs — and a plain `docker compose up -d` in this folder — remember
them.

| `install.sh` | `install.ps1` | what it does |
|---|---|---|
| `--sql` | `-Sql` | adds PostgreSQL ([below](#postgresql)) |
| `--kubeconfig PATH` | `-Kubeconfig PATH` | mounts that kubeconfig ([below](#observing-a-kubernetes-cluster)) |
| `--watchtower` | `-Watchtower` | adds automatic updates ([below](#updating)) |
| `--scan-runner IMAGE` | `-ScanRunner IMAGE` | adds the scan runner with that image ([below](#scanning-container-images-scan-runner)) |
| `--tag TAG` | `-Tag TAG` | which Kwirth: a version (pin it for anything you keep), `latest` or `develop`. Default `latest` |
| `--port N` | `-Port N` | the port on this machine. Default `3883` |
| `--bind ADDR` | `-Bind ADDR` | where the port is published. Default `127.0.0.1`, this machine only; `0.0.0.0` publishes it on every interface |
| `--no-sql`, `--no-kubeconfig`, `--no-watchtower`, `--no-scan-runner` | `-NoSql`, `-NoKubeconfig`, `-NoWatchtower`, `-NoScanRunner` | removes an add-on chosen before. Its data volume is kept |

For example, Kwirth `0.6.57` with PostgreSQL, on port 8080:

```bash
./install.sh up --tag 0.6.57 --sql --port 8080
```

```powershell
.\install.ps1 up -Tag 0.6.57 -Sql -Port 8080
```

## The other commands

| command | what it does |
|---|---|
| `update` | pulls the image of the configured tag and recreates whatever changed. Data is kept |
| `status` | what is running and whether it is healthy |
| `logs` | follows Kwirth's log |
| `down` | stops and removes the containers. **Data is kept** in its volumes; `up` brings everything back |
| `destroy` | removes the containers **and the volumes**: every user, setting, extension and database is lost. Asks you to type `destroy` first. `.env` is kept |

## Without the script

The script only writes `.env` and runs `docker compose`. With an `.env` in place you can do it yourself:

```bash
cp .env.example .env          # then set MASTERKEY, e.g. with: openssl rand -hex 32
docker compose up -d
```

To add an add-on by hand, list it in `COMPOSE_FILE` in `.env` (separated by commas), or pass the files:

```bash
docker compose -f docker-compose.yml -f docker-compose.sql.yml up -d
```

## PostgreSQL

`--sql` adds a `postgres` container (`postgres:16-alpine`) with its own volume, `kwirth_postgres-data`, and
a database password generated into `.env` as `KWIRTH_SQL_PASSWORD`. Kwirth waits until Postgres is healthy
before starting, and connects to it as `kwirth`.

Postgres publishes **no port**: only Kwirth reaches it, over the compose network. Kwirth does not open the
connection at startup — only when an extension asks for a database — and creates one database per
extension.

## Observing a Kubernetes cluster

`--kubeconfig PATH` mounts that kubeconfig, read-only, at `/root/.kube/config`. Kwirth then sees the
cluster of its **current context**, and channels behave as they do for an in-cluster Kwirth.

> ⚠️ **Check the current context before you mount it.** Kwirth connects to whatever cluster that context
> points at. If your kubeconfig holds clusters you should not touch from here, mount a copy with only the
> one you want.

A kubeconfig pointing at `127.0.0.1` — kind, k3d, minikube, Docker Desktop — does **not** work as is:
inside the container that address is the container itself. Use a copy whose `server:` says
`host.docker.internal` instead. That name works on Docker Desktop, and the add-on makes it work on Linux
too. If the cluster's certificate does not include that name, the connection is refused; k3d and kind can
add it when the cluster is created.

Kwirth is still **not a pod** here: "Restart Kwirth" restarts the container, and the core log comes from
memory (see [below](#restarting-and-the-log)).

## Scanning container images (scan runner)

Some extensions scan container images — Excubitor does, to give the CVEs of what runs. On Kubernetes they
run those scans as **Jobs**; in this compose there is no cluster to run Jobs in, so without help the
extension still inventories what it can, but reports no container CVEs. The **scan runner** is that help: a
container with the scanner, which the extension calls over HTTP. It is the same piece that runs as a sidecar
when Kwirth is deployed on ECS.

```bash
./install.sh up --scan-runner IMAGE
```

```powershell
.\install.ps1 up -ScanRunner IMAGE
```

`IMAGE` is the scan runner image your extension's documentation gives — pull access to its registry first
(`docker login <registry>`) if it is private. `up` keeps it in `.env` as `SCAN_RUNNER_IMAGE` and
**generates the token** the runner and the extension share, `SCAN_RUNNER_TOKEN`, once.

Then point the extension at it. In Excubitor: **⋮ → Home settings → Scan runner**:

| field | value |
|---|---|
| URL | `http://scan-runner:8080` |
| Token | `SCAN_RUNNER_TOKEN`, from `.env` |

The runner publishes **no port**: only Kwirth reaches it, over the compose network — and the token is its
only protection, so keep it that way. Its scanner database lives in the `kwirth_trivy-cache` volume; the first
start downloads it (a few minutes), every later one reuses it.

> **Not needed with `--kubeconfig`:** with a cluster in view, the extension can run its scans as Jobs there.

## Updating

There are two ways, and **"Restart Kwirth" is neither**: a restart reuses the image already on this
machine.

- **On demand**: `./install.sh update` (or `.\install.ps1 update`). It pulls the image of the configured
  tag and recreates Kwirth if it changed.
- **By itself**: `--watchtower` adds [Watchtower](https://containrrr.dev/watchtower/), which every
  `WATCHTOWER_POLL_INTERVAL` seconds (default 300) checks whether the tag points at a new image, and if it
  does, pulls it and recreates Kwirth with the same settings. It only touches containers labelled for it,
  which here is Kwirth alone: **Postgres is never updated behind your back**.

> ⚠️ **Watchtower needs the Docker socket, and the Docker socket is root on this machine.** That is why it
> is an add-on and not part of the base.
>
> Watchtower speaks a Docker API older than Docker Engine 29 accepts, and fails with *client version 1.25
> is too old*. The add-on sets `DOCKER_API_VERSION=1.44`, which works from Docker 25 on. If your Docker is
> older, set `WATCHTOWER_DOCKER_API_VERSION` in `.env` to what `docker version` shows as the server API.

Automatic updates make sense with a moving tag (`latest`, `develop`). With a pinned version there is
nothing to update to until you change `--tag`.

## Restarting and the log

**Restart Kwirth** (from the UI) exits Kwirth's process, and the container's restart policy starts it again
in a few seconds. It is the same image: to get a new one, see [Updating](#updating).

The **Log** tab of the Status channel shows the core's own log, kept in memory — the last 5000 lines by
default, configurable in *Settings → Log*. It starts empty with every restart.

## Where Kwirth keeps its data

| what | where | survives `down` | survives `destroy` |
|---|---|---|---|
| users, settings, API keys, extensions | volume `kwirth_kwirth-data`, at `/data` | yes | no |
| extensions' databases (with `--sql`) | volume `kwirth_postgres-data` | yes | no |
| `MASTERKEY`, database password | `.env` in this folder | yes | yes |

**The store is encrypted.** This deployment runs Kwirth as a generic container (`FORCE=container` with
`KWIRTH_STORE=/data`), which encrypts every secret file with AES-256-GCM derived from `MASTERKEY` — the same
as ECS, Cloud Run and ACI. A plain `docker run` without those variables keeps Docker's historical format,
where secrets are **plain JSON**; see [docker/README.md](../../docker/README.md). One visible consequence:
the startup log says `Execution environment: 'container'`, not `'docker'`, and that is expected.

To back up, copy `.env` and the volumes. For the store, while Kwirth is running:

```bash
docker run --rm -v kwirth_kwirth-data:/data -v "$PWD":/backup alpine tar czf /backup/kwirth-data.tgz -C /data .
```

```powershell
docker run --rm -v kwirth_kwirth-data:/data -v "${PWD}:/backup" alpine tar czf /backup/kwirth-data.tgz -C /data .
```

## What the startup log says

The first lines are the ones to read when something looks off (`./install.sh logs`):

```
Execution environment: 'container'
Execution environment capabilities — Kubernetes API: no (no usable kubeconfig) … · Store: encrypted files at '/data' (KWIRTH_STORE)
Using filesystem storage at /data
SQL server kwirth@postgres:5432 (pg)                          (only with --sql)
```

## Everything else

The variables in [`.env.example`](.env.example) are the ones this deployment sets. Any other variable Kwirth
understands — `ROOTPATH`, `BODYLIMIT`, `KEEPALIVE`… — goes in the `environment:` of the `kwirth` service;
they are listed in [docker/README.md](../../docker/README.md#everything-else).
