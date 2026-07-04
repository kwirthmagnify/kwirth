# 1. Deployment

Welcome to **Part II**, the administrator's guide. It covers everything needed to **run and configure** Kwirth: deploying it, securing it, and managing users, keys, clusters, identity providers and extensions.

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

This installs Kwirth in the `kwirth` namespace with defaults. Tune it with a `values.yaml`:

```yaml
kwirth:
  config:
    channelMetrics: "true"
    channelMagnify: "true"
    rootpath: /kwirth
  image: kwirthmagnify/kwirth:0.5.187
```

```bash
helm install kwirth kwirth/kwirth -n kwirth --create-namespace -f values.yaml
```

Most useful Helm options:

| Option | Description | Default |
|---|---|---|
| `masterkey` | Key used to **sign the access keys** issued to clients. **Change this.** | `Kwirth4Ever` |
| `rootpath` | Path Kwirth is served under | `/kwirth` |
| `image` | Full image reference | `kwirthmagnify/kwirth:latest` |
| `resources` | Pod resources (K8s format) | `{ limits: {cpu:1, memory:2Gi}, requests: {cpu:0, memory:256Mi} }` |
| `ingress.enabled` | Deploy an Ingress | `false` |
| `ingress.controller` | Ingress controller (`nginx` / `agic`) | `nginx` |
| `ingress.hostname` | Host in the Ingress | – |
| `nginx.tls` / `nginx.secret` | Enable TLS / secret holding CRT+KEY | – |

> **Channels are plugins now.** Log, Ops, Trivy, Fileman and the rest are loaded as **plugins**, not Helm flags. Install them from the plugin management UI (see [Extending Kwirth](08-extending-kwirth)).

## Kubernetes with manifests

For an express setup:

```bash
kubectl apply -f https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/test/kwirth.yaml
```

Edit the YAML if you need to change defaults.

## Docker

Mount your kubeconfig so Kwirth can reach the cluster:

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

Download the installer for **Windows, macOS or Linux** from the [Releases page](https://github.com/kwirthmagnify/kwirth/releases). On launch, a **context selector** lets you choose which cluster to connect to (LOCAL = contexts in your `kubeconfig`; REMOTE = clusters reachable through a Kwirth server). In this mode the source cluster appears as **`inDesktop`** (see [Selecting what to observe](../user/04-selecting-resources)).

## Publishing and access

- The default Kubernetes install serves Kwirth at `http://<your-dns>/kwirth`.
- To serve it under a different path, create an **Ingress** and set the **`ROOTPATH`** environment variable on the deployment to the same path — that's the one thing Kwirth needs to know:

  ```yaml
  env:
    - name: ROOTPATH
      value: '/quirz'
  ```
- Kwirth listens on port **3883** inside the container; for Docker/External you pick the published port and path yourself (e.g. `-p 8080:3883 --rootpath /fantastic/tony` → `http://localhost:8080/fantastic/tony`).

Next: [Initial configuration →](02-initial-config)
