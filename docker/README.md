# Kwirth in Docker

Run Kwirth as a plain container, on **Linux, Windows or macOS**, with the image published as
`kwirthmagnify/kwirth`. This folder holds what builds and publishes that image, and this page explains
how to run it.

| file | what it is |
|---|---|
| `Dockerfile` | the image. Two stages, so the bundled guide travels once instead of three times |
| `build-image.mjs` | prepares the build context (bundled extensions manifest + fetch script) and runs `docker build` |
| `docker-build.cmd` | reads `version/` and builds `kwirth:<version>` plus `kwirth:latest` |
| `docker-publish-current-as.cmd` | tags and pushes to Docker Hub under a name you pass |
| `docker-import-current-as.cmd` | imports the image into a local k3d cluster |
| `docker-launch.cmd` | runs it locally with a kubeconfig and a store mounted |
| `kwirth-users`, `kwirth.keys` | **not source: runtime state.** See [Where Kwirth keeps its data](#where-kwirth-keeps-its-data) |

> The `.cmd` scripts are Windows-only. On Linux and macOS, build with
> `node build-image.mjs kwirth:<version>` and run the `docker run` below.

## Choosing which Kwirth you run

| tag | what it is | when |
|---|---|---|
| `0.5.228` (any released version) | that exact build, forever | anything you keep running |
| `latest` | whatever was released last | trying it out |
| `develop` | the development build | testing something unreleased |

## Two ways to run it, and they are different

Kwirth in a container can observe a Kubernetes cluster, or observe nothing at all. Both are valid; what
decides is whether you give it a kubeconfig.

### With a kubeconfig — observing a cluster

The usual case: Kwirth runs in a container on your machine and manages a cluster it reaches over the
Kubernetes API. Channels behave exactly as they do for an in-cluster Kwirth.

```bash
docker run -d --name kwirth -p 3883:3883 \
  -v ~/.kube/config:/root/.kube/config:ro \
  -v ~/.kwirth:/data \
  -e CONFIGMAPPATH=/data \
  -e SECRETPATH=/data \
  kwirthmagnify/kwirth:0.5.228
```

On Windows, with PowerShell:

```powershell
docker run -d --name kwirth -p 3883:3883 `
  -v ${env:USERPROFILE}\.kube\config:/root/.kube/config:ro `
  -v ${env:USERPROFILE}\.kwirth:/data `
  -e CONFIGMAPPATH=/data `
  -e SECRETPATH=/data `
  kwirthmagnify/kwirth:0.5.228
```

> A kubeconfig pointing at `127.0.0.1` (kind, k3d, minikube, Docker Desktop) does **not** work as is: from
> inside the container that address is the container itself. Use `host.docker.internal` on Docker Desktop,
> or `--network host` on Linux.

### Without a kubeconfig — observing nothing

```bash
docker run -d --name kwirth -p 3883:3883 \
  -v ~/.kwirth:/data \
  -e CONFIGMAPPATH=/data \
  -e SECRETPATH=/data \
  kwirthmagnify/kwirth:0.5.228
```

This is a complete configuration, not a broken one: the front is served, users log in, autonomous
channels run, ingestion providers receive data, and you can federate against another Kwirth from the
cluster list. Kwirth reports its cluster type as `none`, which is the honest answer.

The startup log says what it found, and it is the first thing to read when something looks off:

```
Execution environment: 'docker'
Execution environment capabilities:
  Kubernetes API: no (no usable kubeconfig), so cluster events, metrics and resources are not available
  Store: plain files (legacy docker format, set by CONFIGMAPPATH and SECRETPATH)
```

> Until recently this did not start at all: without a reachable cluster the startup failed and left the
> process listening but with no instance, answering `503` to everything. That is fixed — a container
> without a kubeconfig is now a supported way to run Kwirth.

## Where Kwirth keeps its data

This is the part that bites, and the reason `docker-launch.cmd` looks the way it does.

Kwirth keeps **users, API keys, settings and installed extensions** in a store. In a container that store
is files on disk, in two paths:

| variable | holds | default |
|---|---|---|
| `CONFIGMAPPATH` | settings, extension registry, API keys | `.` |
| `SECRETPATH` | users, credentials, tokens | `.` |

**Both default to `.`, which inside the image is `/usr/kwirth/dist`.** That is a directory in the
container's own writable layer, so if you mount nothing, everything Kwirth remembers dies with the
container — including the users you created. Nothing warns you: it works perfectly until you run
`docker rm`.

Point both at a mounted volume. They can be the same directory; the file names do not collide.

### The secrets are written in clear

**In Docker mode secrets are plain JSON**, not encrypted. This is not the case everywhere: Kubernetes
with `KWIRTH_STORE`, desktop and ECS all encrypt secret files with AES-256-GCM derived from `MASTERKEY`.
Docker mode keeps its original plain format so that existing installations keep working.

Two consequences:

- **`MASTERKEY` does not encrypt anything here.** It still signs API keys, so set it — but do not assume
  it protects the files.
- **Whatever you mount for `SECRETPATH` holds passwords and tokens readable by anyone with the
  directory.** Do not mount a shared folder, a synced folder, or a directory inside a git repository.

The two files in this folder, `kwirth-users` and `kwirth.keys`, are exactly that: the store of a local
Kwirth, because `docker-launch.cmd` mounts this directory as both paths. They are **git-ignored** as of
2026-09-24 — they were versioned before, with an admin whose password was public. If they are missing,
Kwirth creates the default admin on first start.

## Getting in

First start creates `admin` with a default password. **Change it before exposing the container**, and
remember that if you did not mount a volume that change disappears with the container.

## Everything else

| variable | what it does |
|---|---|
| `PORT` | listening port (default `3883`) |
| `ROOTPATH` | path prefix, when Kwirth hangs off a subpath behind a reverse proxy |
| `MASTERKEY` | signs API keys. **Does not encrypt the store in this mode** |
| `KWIRTH_CLUSTER_NAME` | the name Kwirth shows for itself |
| `BODYLIMIT` | max request body (default `8mb`), for ingestion providers that batch |
| `KEEPALIVE` | idle connection timeout in ms (default `65000`) |
| `FORCE` | override environment detection. Not normally needed |

`GET /healthz` answers `200` in every environment, which is what `--health-cmd` or a reverse proxy
should check.
