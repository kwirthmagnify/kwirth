# 1. Deployment

Welcome to **Part II**, the administrator's guide. It covers everything needed to **run and configure** kwirth: deploying it, securing it, and managing users, keys, clusters, identity providers and extensions.

Kwirth is a **single component** — one container/process — that you can run in several ways. Pick the one that matches your environment.

## Kubernetes with Helm (recommended)

```bash
helm repo add kwirth https://kwirthmagnify.dev/helm-charts
helm repo update
helm install kwirth kwirth/kwirth -n kwirth --create-namespace
```

This installs kwirth in the `kwirth` namespace with defaults. **Read the notes Helm prints**: the chart generates the admin password on the first install and shows it there, the only place it is shown in the clear.

### The mode: how much of the cluster kwirth may touch

`kwirth.mode` is the option that matters most. It is a single value, and the RBAC, the service account, where the configuration lives and the container's security context change with it.

| `kwirth.mode` | What the ClusterRole grants | What you give up |
|---|---|---|
| `normal` (default) | Every verb on the API groups kwirth uses | Nothing: everything works, including the actions that **change** the cluster (Magnify's restart, scale, cordon, drain, evict, apply and delete, and the `ops` and `fileman` plugins). |
| `readonly` | One rule: `get`, `list`, `watch` on everything | The actions that change the cluster. They answer 403 with the buttons still in the UI, so don't install `ops` or `fileman`. Logs, metrics, events and the resource browser work the same. |
| `zero` | No ClusterRole, no binding, no service account of its own, no projected token | Everything that reads the cluster it runs in. What remains: front end, users, extensions, autonomous channels, ingestion providers, database, and federation with other kwirth instances. |

```bash
# readonly: sees everything, changes nothing
helm install kwirth kwirth/kwirth -n kwirth --create-namespace \
  --set kwirth.mode=readonly --set kwirth.persistence.enabled=true

# zero: no Kubernetes permissions at all
helm install kwirth kwirth/kwirth -n kwirth --create-namespace \
  --set kwirth.mode=zero --set kwirth.persistence.enabled=true
```

`readonly` and `zero` need **`kwirth.persistence.enabled=true`**: inside Kubernetes kwirth keeps its configuration in Secrets and ConfigMaps, neither mode may write them, so it goes on a volume. The chart refuses to render without it.

> ⚠️ `readonly` does not stop kwirth from reading Secrets: Kubernetes RBAC has no deny rules, so a role covering every resource kwirth watches can't leave them out.

### The image: what comes inside

The image is published in three variants of the same core. The only difference is which extensions are already inside when the container starts:

| Image tag | Comes with |
|---|---|
| `kwirthmagnify/kwirth:<version>-core` | The core and the bundled guide. No channels. |
| `kwirthmagnify/kwirth:<version>-readonly` | `-core` plus the `log`, `metrics` and `alert` plugins |
| `kwirthmagnify/kwirth:<version>-full` | `-readonly` plus `magnify`. The plain `<version>` tag and `latest` are this one. |

Anything missing can still be installed at runtime from the marketplace (see [Extending kwirth](08-extending-kwirth)); the variant only decides what is there at startup, which is what counts on an air-gapped cluster. Choose it with `--set kwirth.image.tag=<version>-readonly`. The natural pairs are `normal` + `-full`, `readonly` + `-readonly` and `zero` + `-core`; the project [README](https://github.com/kwirthmagnify/kwirth#choosing-a-combination) explains all nine combinations.

### Other useful options

| Option | Description | Default |
|---|---|---|
| `kwirth.config.masterkey` | Key that **signs the access keys** (and encrypts a filesystem store). Empty generates a random one on the first install and keeps it across upgrades. | generated |
| `kwirth.config.rootpath` | Path kwirth is served under | `/kwirth` |
| `kwirth.config.channelMagnify` | The only core channel; follows the mode when unset | on (off in `zero`) |
| `kwirth.image.tag` | Image tag (and with it, the variant) | the chart's `appVersion` |
| `kwirth.ingress.*` | Ingress (`nginx` / `agic`), hostname and TLS | disabled |

Every value is documented in the chart's [README](https://github.com/kwirthmagnify/kwirth/blob/master/deploy/kubernetes/helm/kwirth/README.md).

> **Channels are plugins.** Log, Metrics, Alert, Ops, Trivy, Fileman and the rest are **plugins**, not Helm flags: install them from the plugin management UI (see [Extending kwirth](08-extending-kwirth)), or run an image that already carries them.

## Kubernetes with manifests

For an express setup:

```bash
kubectl apply -f https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/deploy/kubernetes/manifests/kwirth.yaml
```

It creates the `kwirth` namespace and the `kwirth-svc` Service on port 3883, and serves kwirth under `/kwirth`. The first login is `admin` / `password`, and kwirth asks you to change it before letting you in. The same folder has `kwirth-full-ro.yaml` (read-only) and `kwirth-zero.yaml` (no Kubernetes permissions), the equivalents of the Helm modes; read each file's header before applying it.

### The API groups kwirth needs

If you write your own `ClusterRole` instead of using the one in that manifest, grant **all** of these:

```yaml
- apiGroups: ['', 'apps', 'batch', 'autoscaling', 'policy', 'coordination.k8s.io',
              'metrics.k8s.io', 'rbac.authorization.k8s.io', 'networking.k8s.io',
              'storage.k8s.io', 'apiextensions.k8s.io', 'aquasecurity.github.io']
  resources: ['*']
  verbs: ['*']
```

> **`batch` is the one usually forgotten.** Jobs live in that group, so without it **jobs are missing
> from the resource selector** — everything else still works, and the backend log says which type it
> could not list and which API group it belongs to.
>
> A quick check, replacing the namespace and service account with yours:
>
> ```bash
> kubectl auth can-i list jobs --as=system:serviceaccount:kwirth:kwirth-sa -A
> ```

## Docker Compose (recommended without Kubernetes)

On any machine with Docker — Linux, Windows or macOS — the `deploy/compose/` folder of the repository
installs kwirth with one command: it writes the configuration, **generates the master key**, starts the
containers, waits until kwirth is healthy and prints where to log in.

```bash
./install.sh up          # Linux, macOS, WSL
.\install.ps1 up         # Windows PowerShell
```

```
Kwirth is up:  http://127.0.0.1:3883
First login:   admin / password  (change it right away)
```

What it leaves running:

- **kwirth**, published on `127.0.0.1:3883` only — nothing outside the machine reaches it until you pass
  `--bind 0.0.0.0` — with `restart: unless-stopped` and a health check on `/healthz`.
- A volume, `kwirth_kwirth-data`, holding users, settings, API keys and installed extensions, **encrypted**
  with the master key. This is the difference with a plain `docker run` (next section), which writes its
  secrets as plain JSON.
- A `.env` file next to the scripts, with that master key.

!> **Keep a copy of `.env`.** Its `MASTERKEY` is the only key to the encrypted store: lose it and kwirth
cannot read its own data again. Later runs never overwrite it.

The add-ons are options of the same command, and `up` can be run again at any time to change them — they
are remembered in `.env`:

| option (`install.sh` / `install.ps1`) | what it adds |
|---|---|
| `--sql` / `-Sql` | PostgreSQL, for the extensions that keep their data in a database. It publishes no port: only kwirth reaches it |
| `--kubeconfig PATH` / `-Kubeconfig PATH` | mounts that kubeconfig read-only, so kwirth observes the cluster of its **current context** |
| `--watchtower` / `-Watchtower` | Watchtower, which pulls and recreates kwirth by itself when its tag gets a new image. It needs the Docker socket, which is root on the machine |
| `--tag TAG` / `-Tag TAG` | which kwirth: a version, `latest` (the default) or `develop` |
| `--port N` / `-Port N` | the port on the machine (default `3883`) |

And the other commands: `update` (pull the new image of the tag and recreate), `status`, `logs`, `down`
(stop; the data stays) and `destroy` (remove everything, data included, after typing `destroy`).

Two things that behave differently from a pod:

- **Restart kwirth** exits the process and the restart policy starts it again — with the image it already
  has. A new image comes with `update` or with Watchtower, never with a restart.
- The startup log says `Execution environment: 'container'`, not `'docker'`. It is on purpose: it is what
  makes kwirth encrypt its store.

Everything else — backups, the variables in `.env`, kubeconfigs that point at `127.0.0.1` — is in the
[`deploy/compose/` folder](https://github.com/kwirthmagnify/kwirth/tree/master/deploy/compose).

## Docker

Mount your kubeconfig so kwirth can reach the cluster, and a volume for kwirth's own data:

```bash
docker run -d --name kwirth -p 3883:3883 \
  -v ~/.kube/config:/root/.kube/config:ro \
  -v ~/.kwirth:/data \
  -e CONFIGMAPPATH=/data \
  -e SECRETPATH=/data \
  kwirthmagnify/kwirth:latest
```

Without the `/data` volume, users, API keys, settings and installed extensions live inside the container and disappear with `docker rm`. Without a kubeconfig kwirth still starts, observing no cluster.

!> In this mode the secrets are written as **plain JSON** in `/data`. For a deployment you keep, use
[Docker Compose](#docker-compose-recommended-without-kubernetes), which encrypts them.

## External (no Docker)

Install and run the Node package globally:

```bash
npm i -g @kwirthmagnify/kwirth-external
kwirth-external --version
kwirth-external start --front --port 8080 --rootpath /kwirth/lovers
```

Key command-line options include `--port`, `--rootpath`, `--masterkey`, `--metricsinterval`, `--forward` and per-channel flags. `kwirth-external apikey` creates a 1-day API key and exits.

## Desktop

Download the installer for **Windows, macOS or Linux** from the [Releases page](https://github.com/kwirthmagnify/kwirth/releases). On launch, a **context selector** lets you choose which cluster to connect to (LOCAL = contexts in your `kubeconfig`; REMOTE = clusters reachable through a kwirth server). In this mode the source cluster appears as **`inDesktop`** (see [Selecting what to observe](../user/04-selecting-resources)).

## Publishing and access

- The default Kubernetes install serves kwirth at `http://<your-dns>/kwirth`.
- To serve it under a different path, create an **Ingress** and set the **`ROOTPATH`** environment variable on the deployment to the same path — that's the one thing kwirth needs to know:

  ```yaml
  env:
    - name: ROOTPATH
      value: '/quirz'
  ```
- Kwirth listens on port **3883** inside the container; for Docker/External you pick the published port and path yourself (e.g. `-p 8080:3883 --rootpath /fantastic/tony` → `http://localhost:8080/fantastic/tony`).
- **`BODYLIMIT`** caps the size of a request body (default **8mb**). It only matters when an extension
  *receives* data instead of returning it: a log collector batches several records per request and goes
  past the old 100 kB default without effort. The symptom is misleading — kwirth answers **413** with an
  HTML error page before the extension ever sees the request, so it looks like the extension's fault.
- **`KEEPALIVE`** is how long an idle connection is kept open, in milliseconds (default **65000**).
  Node's own default is 5 s, which is too short for anything that *sends* to kwirth on a schedule: the
  sender reuses the connection, finds it closed and reports a network error that reads like "kwirth is
  not listening" when it is.
- The other environment variable worth setting is **`KWIRTH_CLUSTER_NAME`**, which names the cluster in the title bar and the Homepage. kwirth detects the name on AKS, EKS, GKE and k3d, but on **k3s and bare clusters there is nothing to detect** — see [The cluster's own name](06-cluster-management#the-clusters-own-name).

## Reading the core's own log

Everything under [How much kwirth writes to its log](02-initial-config#how-much-kwirth-writes-to-its-log)
decides **what** kwirth writes. This is where you read it, without leaving kwirth for a `kubectl logs` —
which is exactly what you do not have at hand when something is going wrong inside the cluster.

Open a [Status](../../channels/status.md) channel and go to its **Log** tab. It shows the last **1000 lines**
kwirth has written, with the colour kwirth put there: the timestamp in grey, the component in
violet, and the level in its own colour — cyan for `INFO`, yellow for `WARN`, red for `ERRO`, green for
`TRCE`. It is read again with every Status snapshot, so the channel's refresh button — or its auto-refresh —
brings the latest lines; it does not follow the log by itself.

(It used to live in **About kwirth…** → **Core log**; it moved to Status, which is where an administrator looks
at how kwirth is doing.)

It is **only for administrators**, for the same reason as the previous container's log below: these are
kwirth's own internals. The endpoint behind it answers `403` to anybody else, and the tab says so.

**Where the lines come from depends on where kwirth runs.** In a pod they are the container's log, read from
Kubernetes. Anywhere else — Docker, Docker Compose, ECS, Cloud Run, ACI or desktop, with or without a
kubeconfig mounted — kwirth keeps its own log **in memory** and the tab shows the last 1000 lines of it. The
memory log holds 5000 lines by default (*Settings → Log → In-memory log buffer lines*, applied without a
restart) and **starts empty on every restart**: what a crash wrote before is gone with the process.

⚠️ **The colour comes from the log itself.** If you turn *Colour the output (ANSI)* off — which is what you
want when the log is going to end up in a file — the escape codes stop being written, and this viewer has
nothing to colour with: it still shows every line, in grey.

## After an unexpected restart

When kwirth dies inside a cluster, the kubelet starts a **new container in the same pod** and the log that
explains the death stays in the old one. By the time anyone goes looking, the kubelet has usually rotated it
away — which is why those restarts used to be investigated blind.

So kwirth reads it for you. On every startup, when it runs **in Kubernetes and inside the cluster**, it looks
at its own pod status and, if the container had restarted, it fetches the **last 1000 lines** of the previous
container and keeps them **in memory**. Nothing is written to the cluster: each startup reads it again, so
anything stored would always be older than what is already there.

You get to it from the **Previous log** tab of a [Status](../../channels/status.md) channel (it used to be
**About kwirth…** → **Previous container log**). Two things are worth knowing about it:

- It is **only for administrators**. That log carries kwirth's own internals — resource names, paths, error
  traces from extensions — so the tab shows nothing without the `admin` scope, and the endpoint behind it
  answers `403` to anybody else.
- When there is nothing to show, it **says why**. That matters because there are different reasons for
  having nothing to show, and only one of them is worth worrying about:

  | What the tab says | What actually happened |
  |---|---|
  | *No previous log — this container has not restarted* | Normal. There is no previous container, so there is no log. |
  | *… it ended cleanly* | It restarted, but it was shut down properly (exit code 0). |
  | *… it ended abnormally* | A crash. The log is there, and this is the one to read. |

  Status's **Home** tab says the same in its **Previous log** card — *No restarts*, *N restarts*, and an
  *abnormal exit* chip — so a crash is visible without opening anything.

When that last case is detected, kwirth also raises a **notification** on the way in, telling you the exit
code and pointing at Status. You get it **once per restart**, not once per page load: reloading the page does
not bring it back, and a new one only appears after a new abnormal exit.

⚠️ **This only works when the container restarted inside the same pod** — a crash, an OOM kill, a
CrashLoopBackOff. After a rollout the pod is a brand new one and the kubelet keeps nothing from the old one,
so there is genuinely nothing to read. The viewer tells you so instead of showing an empty box: if the
restart happened but the log is already gone, it says that too.

### When the fault is an extension's

Not every crash is kwirth's, and since **0.6.31** it does not pay for one either. A plugin, provider or
sender that leaves a rejected promise unattended used to take the whole core down with it — every channel,
for every user. Now kwirth looks at where the failure came from: extensions are loaded from their own
files, so a fault born inside one is **isolated and logged with the culprit's name**, and the core keeps
serving:

```
[core] [ERROR] ❌ UNHANDLED REJECTION in provider 'trivy' — isolated, kwirth keeps running
```

If you see that line, the extension is the one to fix (or uninstall) — and kwirth did not restart, so
there is no previous container log to read for it. A failure that **cannot** be attributed to an extension
is still treated as kwirth's own and does end the process, on purpose: the core may have been left in a
state not worth trusting.

To read more (or less) than 1000 lines, set the **`PREVIOUSLOGLINES`** environment variable on the
deployment:

```yaml
env:
  - name: PREVIOUSLOGLINES
    value: '3000'
```

### Being told, instead of having to look

Everything above waits for somebody to open something. Nobody opens a dialog because things are going well,
so a restart at four in the morning was a restart nobody heard about. Two things now happen on their own.

**It is shouted into the core log.** When kwirth starts and finds that its previous container left a log
behind, it writes this before anything else:

```
[10:22:41] [core] [ERRO] ********************************************************************************
[10:22:41] [core] [ERRO] KWIRTH RESTARTED — the previous container left a log behind
[10:22:41] [core] [ERRO]   ended with exit code 137 (OOMKilled) · restarts: 3 · container: kwirth
[10:22:41] [core] [ERRO]   1000 lines recovered — Status channel, Previous log tab
[10:22:41] [core] [ERRO] ********************************************************************************
```

It goes out at **error** level on purpose. A warning from the `core` component can be filtered away in
**Kwirth settings → Log**, and this is the one message that has to survive somebody having turned the log
down. Errors are never filtered. If the restart happened but the log is already gone, the fourth line says
*its log could NOT be read* and why — which is a different thing from having read nothing.

**And it can be sent.** In **Kwirth settings → General** (the dialog shown in
[Initial configuration](02-initial-config)), pick a **sender** and one of its **configurations**. From then
on, a restart also puts a message on its way out — one message, not one per line, with the cause
in the subject and the tail of the log in the body. Anything kwirth can send through reaches you this way:
an email, a Teams channel, a file, a ticket.

| Field | What it is |
|---|---|
| **Sender** | Which sender delivers it. `(none — only the core log)` leaves the banner and sends nothing, which is the default. |
| **Config** | One of that sender's configurations. It only lists the ones belonging to the sender you picked, and changing the sender clears it: a config name means nothing without its sender. |
| **Lines to include in that message** | How many of the recovered lines travel, counting from the end. **200** by default. |

⚠️ **That last number is not the one above it.** Up to a thousand lines are *read*, so that the cause does not
fall outside the window; two hundred are *sent*, because a thousand lines in an email is not read by anybody
and a Teams webhook rejects a payload that size outright. They answer different questions and are set apart.

⚠️ **The settings are read when kwirth starts**, like the rest of this page: configure the sender **before**
the restart you want to hear about, not after.

Next: [Initial configuration →](02-initial-config)
