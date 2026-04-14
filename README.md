<p align="center">
    <img height=auto src="https://kwirthmagnify.github.io/kwirth/_media/kwirth-logo-20.png" /><br/>
    <a href='https://kwirthmagnify.github.io/kwirth'><img src='https://img.shields.io/badge/contributions-welcome-orange.svg'/></a>
    <a href='https://kwirthmagnify.github.io/kwirth'><img src='https://img.shields.io/badge/project-homepage-8EA8D8.svg'/></a>
</p>

# Kwirth project
Kwirth is the final implementation of the idea of having a simple way to be able to **receive live-streaming observability data** from your kubernetes clusters (or even another container orchestration systems like Docker or Docker Compose) and have **the chance to interact** with your clusters. Maybe you feel comfortable with your DataDog or your Grafana and the Loki and the Promtrail, or any other observability tool for monitoring your kubernetes. You may even be happy with the high memory footprint of your Lens, or the poor UI interface of your K9s or your Headlamp.

But maybe these (and other tools) are too complex or ugly or uncomfortable or expensive for you. When working with Kubernetes the need for viewing real-time logs, metrics, alerts or whatever observability artifact without the need for storing them is a common scenario.

If this is the case, **Kwirth is what you need**.

You can go to Kwirth site if you prefer a user-friendly (non-developer) web interface [here](https://kwirthmagnify.github.io/kwirth) for reading Kwirth docs.

## What you can do with Kwirth
Basically, Kwirth receives live streams of **observability data** that comes from one or more Kubernetes clusters in real-time, and with the data received you can perform several activities depending on your role and your needs.

  - Kwirth can be used for detecting exceptional situations (alerts) based on log messages (**Alert Channel**).
  - It can also be used by development teams for viewing real-time logs of the containers deployed to your Kubernetes cluster (**Log Channel**), aggregating and serving **together** logs that come from different origins.
  - You can analyze your kubernetes objects performance and resource usage (CPU%, Memory%, bandwidth usage, latencies, filesystem access...) using Kwirth provided metrics (**Metrics Channel**).
  - You can analyze your containers security posture by using the Trivy Operator inside Kwirth (by adding the **Trivy Channel**).
  - You can connect to your pod and view the filesystems in a file system explorer way, not just kubectl cp or /bin/ls, navigate through your live filesystems in your browser by enabling the **Fileman channel**.
  - You can perform day-to-day operations like: restarting objects, **shell to objects**, send commands, get object information... by using the Kwirth Ops Channel.
  - If you want to use all this stuff together, you can enable the **Kwirth Magnify channel**, which is **a complete replacement of a Kubernetes management tool** like Lens or K9s.

And, especially...:

  - You can aggregate all this kind of information from different sources. I mean, for example, you can have one unique live-stream log that consolidates logging information from different sources, i.e., different containers, different pods, different namespaces or even different clusters.
  - You can aggregate or merge metric data from different pods.

## Installation
Since Kwirth 0.5.21 you can install Kwirth in several ways:
  - Inside Kubernetes
  - Outside Kubernetes in a standalone installation.
  - As a Docker container outside of Kubernetes.
  - As a **Desktop application** for Windows and Linux.

Next sections will explain how to perform each one of these setup methods.


### Kubernetes (manifests and Helm chart)

#### Manifests
```bash
kubectl apply -f https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/test/kwirth.yaml
```

If everything is ok, in no more than 8 to 10 seconds Kwirth should be up and running. So next step is accessing the front application of your fresh new logging system. You can access Kwirth via your Kubernetes management tool, via kubectl-port-forwarding, or even creating an ingress (which is the best way). By default, Kwirth listens on root path at port 3883.

If you have created a port forward by entering...

```bash
kubectl port-forward svc/kwirth-svc 3883
```

...you should be able to access Kwirth at http://localhost:3883/.

When you first deploy Kwirth there will exist an admin account. The credentials for the admin account are strong credentials like these:

  - User: `admin`
  - Password: `password`

Enjoy!!

#### Helm
Using Helm is simple and very advantageous due to its simplicity for configuring and deploying Kubernetes software. These are some simple steps to deploy Kwirth using Helm:

  1. Add Kwirth repo to your local local Helm:
     ```
     helm repo add kwirth https://github.com/kwirthmagnify/kwirth/tree/master/deploy/helm
     ```
  2. Install Kwirth on your cluster:
     ```
     helm install kwirth kwirth/kwirth -n kwirth --create-namespace
     ```
     This command installs Kwirth on namespace 'kwirth' (and creates it if needed) using default Kwirth options.

You can review configuration inside `values.yaml` [here](https://kwirthmagnify.dev/#/0.5.40/installation?id=installation).


### Docker
To run Kwirth as a Docker container, you can use the following command, ensuring you mount your kubeconfig file so Kwirth can interact with your cluster:

```bash
docker run -d -p 3883:3883 \
  -v ~/.kube/config:/root/.kube/config \
  --name kwirth kwirthmagnify/kwirth:latest
```

### External (standalone)
If you want to run Kwirth as a standalone service on a host, you can download the binary and run it directly. It will look for your local Kubernetes configuration automatically:

Install with 'npm' (you need a NodeJS installation at recommended V24, although Kwirth can work with V22 and V20)
```bash
npm i -g @kwirthmagnify/kwirth-external
```

Get some help with `kwirth-external --help`, and launch it just typing:
```bash
kwirth-external start --front
```
!> The `--front` is optional, adding it to your command ensures Kwirth server servers front and API.


### Desktop (for personal use)
For a more integrated experience, download the native application for Windows or Linux. This allows you to manage your clusters with a dedicated UI without the need to deploy anything into the cluster itself during initial exploration.

Binaries for Windows (including a Setup if you prefer) and Linux can be downloaded from the [Releases page at our GitHub project](https://github.com/kwirthmagnify/kwirth/releases).

## How Kwirth works
Kwirth is not Loki nor Grafana, Kwirth is not Elastic, Kwirth is not DataDog, Kwirth is not Azure Log Analytics... Kwirth can perform as much as all of the tasks you can do with these observability tools, but with a fraction of the cost (in terms of money, but also in terms of time and kubernetes resource usage).

Kwirth just **shows the right kubernetes information to the user that needs it**. In addition, Kwirth sends data in real time, live-streaming all the information the users request.

It is important to understand that Kwirth *does not store* any logging, metrics or whatever information, it is just a **kubernetes data exporting system and analyse tool**.

The architecture of Kwirth is the one depicted below.

![kwirth architecture](https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/docs/0.5.21/_media/kwirth-kwirth-arch.png)

There is only one pod with one only container needed to run Kwirth. Of course, you can create replicas and services and ingresses if you need to scale out, but, generally speaking, Kwirth has no computing needs, since the only function of the pod is extracting kubernetes data and re-sending it to Kwirth clients, wherever it be Kwirth frontend application or any other client like [Backstage Kubelog](https://www.npmjs.com/package/@jfvilas/plugin-kubelog) or [KwirthLog plugin for Backstage](https://www.npmjs.com/package/@kwirthmagnify/plugin-kwirth-log).

## Kwirth features
Each individual Kwirth feature is implemented via a [**channel**](https://kwirthmagnify.github.io/kwirth/#/0.5.21/channels?id=channels). a channel serves, in fact, a specific type of information. These are currently existing channels:

  - Log Channel, for receiving real-time logs or obtain **start diagnostics reviewing start-time logs**.
  - Metrics Channel, for viewing real-time metrics on your selected objects (CPU%, memory%, I/O, etc.). Please note that Kwirth doesn't need Prometheus for getting data, Kwirth implements its own metric-gathering system by accessing directly the cAdvisor running on your nodes' Kubelets.
  - Alert Channel, for receiving real-time alerts on specific log messages (or regexes matched on log messages).
  - Ops Channel, for performing container operations like restart or shell.
  - Trivy Channel, for reviewing the cybersecurity risks associated to your Kubernetes objects (based on Trivy Operator).
  - Fileman Channel, visually work with your container filesystems.
  - Magnify Channel, a complete Kubernetes Management tool.

Each individual channel can be activated/deactivated when starting Kwirth.

## The Kwirth family
What follows is an architectural view of the different ways you can deliver Kwirth capabilities according to your different needs and architecture.

### The ideas:
  - **There exist mainly 2 fronts:**
    - **Web browser**: Access the Kwirth UI from any browser once the backend is deployed.
    - **Magnify**: A native Desktop installation for Windows or Linux specifically designed to use the Magnify channel as a standalone management tool.
  - **There exist several backend options:**
    - **A Node.js application**: A standalone installation (with or without the built-in frontend).
    - **A Docker deployment**: Containerized setup (with or without the frontend) created for serving Kwirth data-streams from **outside your Kubernetes cluster**.
    - **A Kubernetes deployment**: Using manifests or Helm charts to serve data-streams directly from **INSIDE** your Kubernetes cluster.

There exist no functional differences between these options; however, performance is significantly better when accessing the Kube API server from within the cluster (Kwirth Kubernetes Deployment) compared to accessing it from **OUTSIDE** (Magnify, Docker, or External) due to network latency and authentication overhead. Feel free to try them out and ask us for recommendations!

![Kwirth family architecture](https://raw.githubusercontent.com/kwirthmagnify/kwirth/master/docs/0.5.21/_media/kwirth-family.png)
