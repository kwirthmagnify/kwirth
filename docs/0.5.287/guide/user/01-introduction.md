# 1. Introduction

Kwirth is a **simple, real-time observability tool for Kubernetes**. It runs as **a single pod** inside your cluster and gives you logs, metrics, alerts, security information and day-to-day operations from **one web interface** — with no external stack to install and maintain.

This part of the guide (Part I) is for **users**: anyone who logs in to Kwirth to *observe* and *operate* one or more clusters. You do not need to know how Kwirth was deployed or configured — that is covered in [Part II (administration)](../admin/01-deployment).

## What you can do with Kwirth

- **Stream logs** in real time from a container, a pod, a whole namespace, or a custom mix of objects.
- **Watch metrics** (CPU, memory, network, I/O) live for any set of objects.
- **Get alerts** when a log line matches the patterns you care about.
- **Operate** your workloads: open a shell, restart, inspect, browse container filesystems and volumes.
- **See security findings** (vulnerabilities) and an interactive **3D topology** of your cluster.
- **Consolidate several clusters** into a single view.

## Key concepts

You will meet these words all over the interface. A quick mental model:

| Concept | What it is |
|---|---|
| **Cluster** | A Kubernetes cluster Kwirth can observe. Kwirth can manage **more than one** cluster from a single screen. |
| **Channel** | A *kind* of observability activity — Log, Metrics, Alert, Ops, Fileman, Trivy, Topology, and more. A channel is what actually streams data to your screen. |
| **Tab** | A single running channel bound to a selection of objects (for example, *"logs of all pods in namespace `production`"*). Tabs are the working unit you open, save and reopen. |
| **Workspace** | A saved arrangement of tabs you can bring back with one click, so you don't rebuild your view every time. |
| **Scope** | What your user is allowed to do and see. Your administrator grants scopes; they decide which channels, clusters and namespaces are available to you. |

## How the rest of Part I is organized

1. **This introduction.**
2. [Accessing Kwirth](02-access) — logging in.
3. [The Kwirth UI](03-ui-tour) — a tour of the screen.
4. [Selecting what to observe](04-selecting-resources) — choosing clusters, namespaces, pods and containers.
5. [Working with channels](05-channels) — opening channels and using them.
6. [Workspaces](06-workspaces) — saving and reusing your work.
7. [Everyday tasks](07-everyday-tasks) — step-by-step recipes.

> **Tip:** if you only have five minutes, read [Accessing Kwirth](02-access) and [Everyday tasks](07-everyday-tasks) — that is enough to get real work done.
