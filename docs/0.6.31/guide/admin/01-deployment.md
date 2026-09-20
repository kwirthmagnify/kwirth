# 1. Deployment

Welcome to **Part II**, the administrator's guide. It covers everything needed to **run and configure** kwirth: deploying it, securing it, and managing users, keys, clusters, identity providers and extensions.

Kwirth is a **single component** — one container/process — that you can run in several ways. Pick the one that matches your environment.

## Kubernetes with Helm (recommended)

1. Add the repo:
   ```bash
   helm repo add kwirth https://github.com/kwirthmagnify/kwirth/tree/master/deploy/helm
   ```
2. Install:
   ```bash
   helm install kwirth kwirth/kwirth -n kwirth --create-namespace
   ```

This installs kwirth in the `kwirth` namespace with defaults. Tune it with a `values.yaml`:

```yaml
kwirth:
  config:
    channelMetrics: "true"
    channelMagnify: "true"
    rootpath: /kwirth
  image: kwirthmagnify/kwirth:0.6.31
```

```bash
helm install kwirth kwirth/kwirth -n kwirth --create-namespace -f values.yaml
```

Most useful Helm options:

| Option | Description | Default |
|---|---|---|
| `masterkey` | Key used to **sign the access keys** issued to clients. **Change this.** | `Kwirth4Ever` |
| `rootpath` | Path kwirth is served under | `/kwirth` |
| `image` | Full image reference | `kwirthmagnify/kwirth:latest` |
| `resources` | Pod resources (K8s format) | `{ limits: {cpu:1, memory:2Gi}, requests: {cpu:0, memory:256Mi} }` |
| `ingress.enabled` | Deploy an Ingress | `false` |
| `ingress.controller` | Ingress controller (`nginx` / `agic`) | `nginx` |
| `ingress.hostname` | Host in the Ingress | – |
| `nginx.tls` / `nginx.secret` | Enable TLS / secret holding CRT+KEY | – |

> **Channels are plugins now.** Log, Ops, Trivy, Fileman and the rest are loaded as **plugins**, not Helm flags. Install them from the plugin management UI (see [Extending kwirth](08-extending-kwirth)).

## Kubernetes with manifests

For an express setup:

```bash
kubectl apply -f https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/test/kwirth.yaml
```

Edit the YAML if you need to change defaults.

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

## Docker

Mount your kubeconfig so kwirth can reach the cluster:

```bash
docker run -d -p 3883:3883 \
  -v ~/.kube/config:/root/.kube/config \
  --name kwirth kwirthmagnify/kwirth:latest
```

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
- The other environment variable worth setting is **`KWIRTH_CLUSTER_NAME`**, which names the cluster in the title bar and the Homepage. kwirth detects the name on AKS, EKS, GKE and k3d, but on **k3s and bare clusters there is nothing to detect** — see [The cluster's own name](06-cluster-management#the-clusters-own-name).

## After an unexpected restart

When kwirth dies inside a cluster, the kubelet starts a **new container in the same pod** and the log that
explains the death stays in the old one. By the time anyone goes looking, the kubelet has usually rotated it
away — which is why those restarts used to be investigated blind.

So kwirth reads it for you. On every startup, when it runs **in Kubernetes and inside the cluster**, it looks
at its own pod status and, if the container had restarted, it fetches the **last 1000 lines** of the previous
container and keeps them **in memory**. Nothing is written to the cluster: each startup reads it again, so
anything stored would always be older than what is already there.

You get to it from **About kwirth…** → **Previous container log**. Two things are worth knowing about that
button:

- It is **only for administrators**. That log carries kwirth's own internals — resource names, paths, error
  traces from extensions — so the button does nothing without the `admin` scope, and the endpoint behind it
  answers `403` to anybody else.
- It stays **visible even when it cannot be used**, and the tooltip says why. That matters because there are
  two different reasons for having nothing to show, and only one of them is worth worrying about:

  | What the tooltip says | What actually happened |
  |---|---|
  | *This container has not restarted…* | Normal. There is no previous container, so there is no log. |
  | *The previous container ended cleanly* | It restarted, but it was shut down properly (exit code 0). |
  | *The previous container ended abnormally* | A crash. The log is there, and this is the one to read. |

When that last case is detected, kwirth also raises a **notification** on the way in, telling you the exit
code and pointing at About. You get it **once per restart**, not once per page load: reloading the page does
not bring it back, and a new one only appears after a new abnormal exit.

![Previous container log](_media/guide/admin-about-previous-log.png)

⚠️ **This only works when the container restarted inside the same pod** — a crash, an OOM kill, a
CrashLoopBackOff. After a rollout the pod is a brand new one and the kubelet keeps nothing from the old one,
so there is genuinely nothing to read. The viewer tells you so instead of showing an empty box: if the
restart happened but the log is already gone, it says that too.

To read more (or less) than 1000 lines, set the **`PREVIOUSLOGLINES`** environment variable on the
deployment:

```yaml
env:
  - name: PREVIOUSLOGLINES
    value: '3000'
```

Next: [Initial configuration →](02-initial-config)
