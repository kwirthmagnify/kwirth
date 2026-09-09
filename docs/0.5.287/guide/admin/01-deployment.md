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
  image: kwirthmagnify/kwirth:0.5.287
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

> **`batch` is easy to miss and its absence is confusing.** Jobs live in that group, and kwirth lists
> every controller type together when it builds the resource selector. Without `batch`, listing jobs is
> refused and **the selector shows no controllers at all** — not even the deployments you *can* read.
> From version 0.5.288 the missing type is simply skipped and the reason is logged naming the group, but
> those controllers still will not appear until the permission is granted.
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

Next: [Initial configuration →](02-initial-config)
