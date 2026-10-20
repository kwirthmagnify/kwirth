<p align="center">
    <img alt="Kwirth" width="320" src="https://kwirthmagnify.dev/_media/kwirth-transparent.png" /><br/>
    <a href='https://kwirthmagnify.github.io/kwirth'><img src='https://img.shields.io/badge/contributions-welcome-orange.svg'/></a>
    <a href='https://kwirthmagnify.github.io/kwirth'><img src='https://img.shields.io/badge/project-homepage-8EA8D8.svg'/></a>
</p>

# Kwirth project
Kwirth is the final implementation of the idea of having a simple way to be able to **manage your Kubernetes cluster** and **receive live-streaming observability data** from your Kubernetes clusters (or even other container orchestration systems like Docker or Docker Compose). With Kwirth you will have **the chance to interact** with your clusters in a centralized way. There are options for managing (K9s, Lens, Headlamp) or observing (Prometheus, Grafana...) your clusters, but maybe you just need a simple tool with extremely low footprint requirements, and a single tool for all these jobs.

In addition, **managing Kubernetes with real-time data** improves the quality, effectiveness and efficiency of your decisions, helping you perform the right action at the right moment.

**Kwirth is what you need**.

If you prefer a user-friendly (non-developer) web interface for reading the docs, go to the [Kwirth site](https://kwirthmagnify.dev).

## What you can do with Kwirth
Basically, Kwirth receives live streams of **observability data** that comes from one or more Kubernetes clusters in real time, and with the data received you can perform several activities depending on your role and your needs.

Live data streams empower cluster admins by providing a simple and powerful way to manage Kubernetes, either from your desktop or deployed inside your cluster.

  - Kwirth can be used for detecting exceptional situations (alerts) based on log messages (**Alert Channel**).
  - It can also be used by development teams for viewing real-time logs of the containers deployed to your Kubernetes cluster (**Log Channel**), aggregating and serving **together** logs that come from different origins.
  - You can analyze your Kubernetes objects' performance and resource usage (CPU%, Memory%, bandwidth usage, latencies, filesystem access...) using Kwirth provided metrics (**Metrics Channel**).
  - You can analyze your containers' security posture by using the Trivy Operator inside Kwirth (by adding the **Trivy Channel**).
  - You can browse your pods' filesystems in a file explorer in your browser, instead of using kubectl cp or /bin/ls (**Fileman Channel**).
  - You can perform day-to-day operations like restarting objects, **opening a shell**, sending commands, getting object information... (**Ops Channel**).
  - If you want to use all this together, you can enable the **Kwirth Magnify Channel**, which is **a complete replacement of a Kubernetes management tool** like Lens or K9s.

And above all:

  - You can aggregate all this kind of information from different sources. For example, you can have a single live log stream that consolidates logging information from different sources, i.e., different containers, different pods, different namespaces or even different clusters.
  - You can aggregate or merge metric data from different pods.

## Installation
Since Kwirth 0.5.21 you can install Kwirth in several ways:
  - Inside Kubernetes.
  - Outside Kubernetes in a standalone installation.
  - As a Docker container outside of Kubernetes.
  - As a **Desktop application** for Windows and Linux.

The next sections explain each of these setup methods.


### Kubernetes (manifests and Helm chart)

#### Manifests
```bash
kubectl apply -f https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/deploy/kubernetes/manifests/kwirth.yaml
```

This creates the `kwirth` namespace with everything Kwirth needs in it, including the `kwirth-svc` Service on port 3883. Within a few seconds Kwirth should be up and running. You can reach it through your Kubernetes management tool, with `kubectl port-forward`, or by creating an ingress (the best option for regular use). Kwirth is served under the `/kwirth` path.

With a port forward:

```bash
kubectl port-forward -n kwirth svc/kwirth-svc 3883
```

Kwirth is then available at http://localhost:3883/kwirth.

The first login is `admin` / `password`, and Kwirth asks you to change that password before letting you in.

The same folder has two more manifests, matching the Helm modes described below: `kwirth-full-ro.yaml` (read-only) and `kwirth-zero.yaml` (no Kubernetes permissions). Read the header of each before applying it: both keep Kwirth's configuration on a volume, through a PersistentVolumeClaim that uses your cluster's default StorageClass.

#### Helm
Add the repo and install:

```bash
helm repo add kwirth https://kwirthmagnify.dev/helm-charts
helm repo update
helm install kwirth kwirth/kwirth -n kwirth --create-namespace
```

> **Where the chart lives in this repo.** [`deploy/kubernetes/helm/`](deploy/kubernetes/helm) is the chart's home: its README documents **every value**, and the source itself is the `kwirth/` folder next to it, versioned in its `Chart.yaml`. What `helm repo add` downloads are the packaged `.tgz` files in [`docs/helm-charts/`](docs/helm-charts), which GitHub Pages serves as the repository above; they are built from that source by `publish-chart.mjs` and are never edited by hand. Releasing a version is [PUBLISHING.md](deploy/kubernetes/helm/PUBLISHING.md).

This installs Kwirth in the `kwirth` namespace (created if needed) with the default options. Read the notes Helm prints: the chart generates the admin password on the first install and shows it there, and that is the only place it is shown in the clear.

The option that matters most is **`kwirth.mode`**: how much of the cluster Kwirth is allowed to touch. It is a single value, and everything that has to change with it (RBAC, service account, where the configuration lives, the container's security context) changes with it.

| `kwirth.mode` | What the ClusterRole grants | What you give up |
|---|---|---|
| `normal` (default) | Every verb on the API groups Kwirth uses | Nothing. Everything works, including the actions that **change** the cluster: Magnify's restart, scale, cordon, drain, evict, apply and delete, and the `ops` and `fileman` plugins, which open a shell in a pod. |
| `readonly` | One rule: `get`, `list`, `watch` on everything | The actions that change the cluster. They answer 403 and the buttons stay in the UI, so don't install `ops` or `fileman` here. Logs, metrics, events and the resource browser work exactly the same. |
| `zero` | No ClusterRole, no binding, no service account of its own, no projected token | Everything that reads the cluster it runs in. What remains: the front end, users, extensions, autonomous channels, ingestion providers, the database, and federation with other Kwirth instances that do have access. |

```bash
# normal: everything works, including the actions that change the cluster
helm install kwirth kwirth/kwirth -n kwirth --create-namespace

# readonly: sees everything, changes nothing
helm install kwirth kwirth/kwirth -n kwirth --create-namespace \
  --set kwirth.mode=readonly --set kwirth.persistence.enabled=true

# zero: no Kubernetes permissions at all, and no credential in the container
helm install kwirth kwirth/kwirth -n kwirth --create-namespace \
  --set kwirth.mode=zero --set kwirth.persistence.enabled=true
```

`readonly` and `zero` need **`kwirth.persistence.enabled=true`**. Inside Kubernetes, Kwirth keeps its own configuration in Secrets and ConfigMaps, and neither mode is allowed to write them, so the configuration goes on a volume instead. The chart refuses to render without it, rather than give you an install that looks healthy and loses its users on the first restart.

⚠️ `readonly` does not stop Kwirth from reading Secrets. Kubernetes RBAC has no deny rules, so a role that covers every resource Kwirth watches (including CRDs, which differ from cluster to cluster) can't leave Secrets out.

All the chart's values are documented in its [README](deploy/kubernetes/helm/README.md) and in [`values.yaml`](deploy/kubernetes/helm/kwirth/values.yaml).

#### Images
The Kwirth image is published in three variants, built from the same Dockerfile and the same core. The only difference is which extensions are already **inside** the image when the container starts:

| Image tag | Comes with | Good for |
|---|---|---|
| `kwirthmagnify/kwirth:<version>-core` | The core and the bundled user guide. No channels. | Building your own set from the marketplace, or a Kwirth that doesn't look at a cluster at all. |
| `kwirthmagnify/kwirth:<version>-readonly` | `-core` plus the `log`, `metrics` and `alert` plugins | Watching a cluster: logs, live metrics and alerts. |
| `kwirthmagnify/kwirth:<version>-full` | `-readonly` plus `magnify`, the resource browser | The complete Kwirth. The plain `kwirthmagnify/kwirth:<version>` tag and `latest` are this one. |

Anything an image doesn't include can still be **installed at runtime** from the extension marketplace. The variant only decides what is there at startup. That matters on an air-gapped cluster, or one whose egress can't reach npm: there, what the image carries is all you get.

With Helm, choose the variant with the image tag:

```bash
helm install kwirth kwirth/kwirth -n kwirth --create-namespace \
  --set kwirth.mode=readonly --set kwirth.persistence.enabled=true \
  --set kwirth.image.tag=<version>-readonly
```

#### Choosing a combination
Mode and image are independent, so there are nine combinations. The mode decides what Kwirth is **allowed** to do in the cluster; the image decides what it **carries**. ★ marks the natural pairs.

| | **`-core` image** | **`-readonly` image** | **`-full` image** |
|---|---|---|---|
| **`normal` mode** | **You get:** every permission, and no channels until you install them.<br>**For:** teams that choose their own extensions from the marketplace, and the smallest possible image. Needs access to npm, or a private registry, to install anything. | **You get:** logs, metrics and alerts out of the box, with permission to act on the cluster if you add plugins that do.<br>**For:** clusters you mostly observe but may need to operate later, such as adding `ops` from the marketplace without redeploying. | ★ **You get:** the complete Kwirth: logs, metrics, alerts, the resource browser and all its actions (restart, scale, drain, apply, delete).<br>**For:** platform and operations teams that run the cluster. This is the default, and the right choice when in doubt. |
| **`readonly` mode** | **You get:** a Kwirth that can see everything and change nothing, with no channels yet.<br>**For:** organizations that approve every extension before it's installed, starting from an empty, curated base. | ★ **You get:** logs, live metrics and alerts, with no way to change anything in the cluster.<br>**For:** production clusters, on-call engineers, developers and auditors who need to see but must not touch. Also air-gapped clusters that only need observation. | **You get:** everything in `-readonly`, plus the resource browser. Its actions answer 403, with the buttons still shown.<br>**For:** production clusters where people need to browse resources, YAML, events and pod metrics, as long as everyone knows the actions are disabled. |
| **`zero` mode** | ★ **You get:** a Kwirth with no Kubernetes permissions and no credential in the pod: front end, users, extensions, autonomous channels, ingestion providers, database and federation with other Kwirth instances.<br>**For:** a central hub that federates the Kwirth instances running in other clusters, or ingests data from outside Kubernetes, in clusters whose policy grants nothing. | **You get:** the same as with `-core`. The `log`, `metrics` and `alert` plugins are in the image, but there is no cluster behind them, so they have nothing to show.<br>**For:** not recommended. Only if you run one single image everywhere and accept carrying plugins you won't use. | **You get:** the same as with `-core`, with Magnify switched off by the mode as well.<br>**For:** not recommended. Same reason: one image for every deployment, at the cost of carrying everything unused. |

### Docker
To run Kwirth as a Docker container, you can use the following command, ensuring you mount your kubeconfig file so Kwirth can interact with your cluster:

```bash
docker run -d --name kwirth -p 3883:3883 \
  -v ~/.kube/config:/root/.kube/config:ro \
  -v ~/.kwirth:/data \
  -e CONFIGMAPPATH=/data \
  -e SECRETPATH=/data \
  kwirthmagnify/kwirth:latest
```

Mount a volume for Kwirth's data (`/data` above): without it, users, API keys, settings and installed extensions live in the container and disappear with `docker rm`. Without a kubeconfig, Kwirth still starts: it simply observes no cluster. A kubeconfig pointing at `127.0.0.1` (kind, k3d, minikube, Docker Desktop) does not work as is, because inside the container that address is the container itself. All the details are in [docker/README.md](docker/README.md).

### External (standalone)
If you want to run Kwirth as a standalone service on a host, you can install it with npm and run it directly. It will look for your local Kubernetes configuration automatically.

Install it with `npm` (you need Node.js 24, recommended; 22 and 20 also work):
```bash
npm i -g @kwirthmagnify/kwirth-external
```

Get some help with `kwirth-external --help`, and launch it by typing:
```bash
kwirth-external start --front
```
> **Note:** `--front` is optional; with it, the Kwirth server serves both the front end and the API.

### Desktop (for personal use)
For a more integrated experience, download the native application for Windows or Linux. This allows you to manage your clusters with a dedicated UI without the need to deploy anything into the cluster itself during initial exploration.

Binaries for Windows (including a Setup if you prefer) and Linux can be downloaded from the [Releases page at our GitHub project](https://github.com/kwirthmagnify/kwirth/releases).

## How Kwirth works
Kwirth is neither Loki nor Grafana, Kwirth is not Elastic, Kwirth is not DataDog, Kwirth is not Azure Log Analytics... Kwirth can do many of the tasks you can do with these observability tools, but at a fraction of the cost (in terms of money, but also in terms of time and Kubernetes resource usage).

Kwirth just **shows the right Kubernetes information to the user that needs it**. In addition, Kwirth sends data in real time, live-streaming all the information the users request.

It is important to understand that Kwirth *does not store* any logs, metrics or any other data: it is just a **Kubernetes data exporting system and analysis tool**.

The architecture of Kwirth is the one depicted below.

![kwirth architecture](https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/docs/0.5.21/_media/kwirth-kwirth-arch.png)

A single pod with a single container is all you need to run Kwirth. Of course, you can create replicas and services and ingresses if you need to scale out, but, generally speaking, Kwirth has no computing needs, since the only function of the pod is extracting Kubernetes data and re-sending it to Kwirth clients, whether it is the Kwirth frontend application or any other client like [Backstage Kubelog](https://www.npmjs.com/package/@jfvilas/plugin-kubelog) or [KwirthLog plugin for Backstage](https://www.npmjs.com/package/@kwirthmagnify/plugin-kwirth-log).

## Kwirth features
Each individual Kwirth feature is implemented via a **channel**. A channel serves, in fact, a specific type of information. Magnify is built into the core; every other channel is a **plugin** that you install from the extension marketplace inside Kwirth (or that comes already inside the image you run, see [Images](#images)). These are the main ones:

  - Log Channel, for receiving real-time logs or obtaining **start diagnostics by reviewing start-time logs**.
  - Metrics Channel, for viewing real-time metrics on your selected objects (CPU%, memory%, I/O, etc.). Please note that Kwirth doesn't need Prometheus for getting data: it implements its own metric-gathering system by reading directly from the cAdvisor running on your nodes' kubelets.
  - Alert Channel, for receiving real-time alerts on specific log messages (or regexes matched on log messages) and on metric thresholds.
  - Ops Channel, for performing container operations like restart or shell.
  - Trivy Channel, for reviewing the cybersecurity risks associated with your Kubernetes objects (based on Trivy Operator).
  - Fileman Channel, for working visually with your container filesystems.
  - Magnify Channel, a complete Kubernetes management tool.

A plugin channel is turned on by installing it and off by uninstalling it. Magnify, the only core channel, can be turned off with the `CHANNEL_MAGNIFY=false` environment variable.

## The Kwirth family
What follows is an architectural view of the different ways you can deliver Kwirth capabilities according to your different needs and architecture.

### The ideas
  - **There are two front ends:**
    - **Web browser**: Access the Kwirth UI from any browser once the backend is deployed.
    - **Desktop**: A native Desktop installation for Windows or Linux specifically designed to use the **Magnify** channel as a standalone management tool.
  - **There are several backend options:**
    - **A Node.js application**: A standalone installation (with or without the built-in frontend).
    - **A Docker deployment**: Containerized setup (with or without the frontend) created for serving Kwirth data-streams from **outside your Kubernetes cluster**.
    - **A Kubernetes deployment**: Using manifests or Helm charts to serve data-streams directly from **INSIDE** your Kubernetes cluster.

There are no functional differences between these options; however, performance is significantly better when accessing the Kube API server from within the cluster (Kwirth Kubernetes Deployment) compared to accessing it from **OUTSIDE** (Magnify, Docker, or External) due to network latency and authentication overhead. Feel free to try them out and ask us for recommendations!

![Kwirth family architecture](https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/docs/0.5.21/_media/kwirth-family.png)
