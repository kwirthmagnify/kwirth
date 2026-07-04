# 🔍 Magnify (plugin)

> **Type:** Channel — **built-in** (ships with the Kwirth core)<br>
> **Package:** built-in (no install needed)<br>
> **Icon:** 🔍

## Overview

**Magnify** is not just a channel — it's a **complete Kubernetes management tool** built *inside* Kwirth, in the spirit of **Lens / K9s / Headlamp**. Where other channels stream one kind of data, Magnify streams **everything happening in your cluster** — all **Kubernetes artifacts** and all **events** — in real time, and lets you **act** on them.

On top of that live stream it adds:

- An **upward command stream** to send changes back to Kubernetes (create / edit / delete / restart / evict…).
- The ability to **open other Kwirth channels from within Magnify** — Logs, Metrics, Trivy, Fileman, and shells (Ops) — as **windows**.
- **Editors** for Kubernetes objects, **full-text search** across artifacts, **cluster validation**, and **CRD** management.
- **LogSearch** — full-text search across pod logs without opening individual log streams.
- **Multi-cluster**: manage all your clusters from one place.

> Magnify is **built-in** — there's nothing to install. It's the closest thing to "a whole cluster IDE" inside Kwirth, which is why it's the crown jewel.

## When to use it

- As your **primary cluster console** — browse, inspect, edit and operate every kind of object.
- To **jump between tools** on one object (see its logs, then its metrics, then shell in) without leaving the page.
- To **search logs across many pods** at once, validate the cluster, or manage CRDs.

## Starting Magnify

It needs **no configuration**. Put **any** resource in the selector (it doesn't matter which), set **Channel = `magnify`**, **ADD**, then **gear ⚙ → Start**. The cluster overview appears and fills in within milliseconds.

## The cluster overview

The landing screen (a header with **cluster name, Kubernetes version, platform and node count**) has **three sections**:

![Magnify cluster overview](../../../_media/guide/channel-magnify-overview.png)

**1 · Consumption charts.** Real-time cluster consumption — **% CPU**, **% Memory** and network **Tx / Rx Mbps** — drawn live (no Prometheus needed).

**2 · Validations.** The row of hexagon **badges**, one per resource kind (node, ConfigMap, Secret, Deployment, ReplicaSet, StatefulSet, DaemonSet, Job, Ingress, Service, volume, Role, ClusterRole…). Each badge carries **two counters — errors and warnings** — from Magnify's cluster validation, so you can spot at a glance which kinds of objects have problems (e.g. a red count on *Deployments* tells you a workload needs attention).

**3 · Recent cluster events.** A live feed of the latest Kubernetes **events** (container created/started, image pulled, job completed, pod created…), each timestamped, with **MORE EVENTS** to open the full stream.

## The navigation pane

The left pane groups everything the cluster contains. Click a category to expand it:

![Magnify navigation pane](../../../_media/guide/channel-magnify-nav.png)

| Category | Contains |
|---|---|
| **Overview** | The cluster dashboard above. |
| **Cluster** | Nodes, namespaces and cluster-scoped info. |
| **Workload** | Pods, Deployments, Daemon Sets, Replica Sets, Replication Controllers, Stateful Sets, Jobs, Cron jobs. |
| **Config** | ConfigMaps, Secrets and other configuration objects. |
| **Network** | Services, Ingresses and networking objects. |
| **Storage** | Volumes, claims, CSI drivers, volume attachments. |
| **Access** | RBAC — Roles, ClusterRoles, bindings, service accounts. |
| **Custom** | Your **CRDs** and their instances. |
| **Preferences** | Magnify's own settings (see below). |

## Browsing resources

Each list is a rich, live table. For example, **Workload → Pods**:

![Magnify pods list](../../../_media/guide/channel-magnify-workload.png)

- Columns include **Name, Namespace, Container, live CPU, live Memory, Restarts, Controller, Node, Age, Status**.
- **Filter** by column (Node / Namespace / Controller) or free-text **Search**.
- Create objects directly (**+ New pod**, etc.).
- Everything updates in real time as the cluster changes.

## Acting on objects

Select an object (or several) and an **action toolbar** appears — this is where Magnify **integrates the other channels**:

![Magnify action toolbar](../../../_media/guide/channel-magnify-actions.png)

| Action | What it does |
|---|---|
| **Pod details** | Full details of the object. |
| **Shell** | Open a shell into a container (the [Ops](ops) channel). |
| **Edit** | Edit the object's manifest in an editor and apply. |
| **Logs** | Open a [Log](log) window for the object. |
| **Metrics** | Open a [Metrics](metrics) window. |
| **Fileman** | Browse the container filesystem ([Fileman](fileman)). |
| **Trivy** | Scan it for vulnerabilities ([Trivy](trivy)) — Magnify can even deploy the Trivy Operator if it isn't installed. |
| **Delete / Evict** | Remove or evict the object. |

## Object details & editing

**Pod details** (and the equivalent for every other kind) opens a **detail window** with the object's **Properties** (created, namespace, labels, annotations, owner, status, node, IPs, service account, QoS…) and, for pods, its **Conditions** — plus the same per-object toolbar (copy, edit, logs, metrics, fileman, trivy, topology, delete, evict):

![Magnify pod details window](../../../_media/guide/channel-magnify-pod-detail.png)

- Cross-references are **links** — click the namespace, owner controller, node or service account to jump to that object.
- The same pattern gives every kind its own detail window: **Secret** details, **Node** details (and a **shell into a node**), **image** details, and so on.

**Editing manifests.** The **✏️ Edit** action opens the object's **manifest in a YAML editor**; change it and **OK/Apply** to push it to Kubernetes. For example, editing the `coredns` ConfigMap:

![Magnify — edit a ConfigMap manifest](../../../_media/guide/channel-magnify-configmap-edit.png)

**Secrets** get a detail view that lists their **Data** keys (values shown behind a lock; here masked for the docs):

![Magnify — Secret details](../../../_media/guide/channel-magnify-secret-detail.png)

## Nodes, node shells & images

**Cluster → Nodes** lists your nodes with live **CPU / Memory** usage, **taints**, **roles** and Kubernetes **version**. Select a node and you can open a **shell on the node itself** — Magnify launches a small helper pod to bridge you in:

![Launching a node shell](../../../_media/guide/channel-magnify-node-shell-start.png)

Once it's up you get a full TTY **on the node**, where you can inspect node-level processes — the k3s/kubelet agent, containerd, the CNI, ingress, etc.:

![Node shell running](../../../_media/guide/channel-magnify-node-shell.png)

**Cluster → Images** inventories every container **image** across the cluster (name, tag, size). Each image's detail shows its **registry**, **tag**, **digest (SHA)**, full reference names, and the **nodes that have it pulled**:

![Image details](../../../_media/guide/channel-magnify-image-detail.png)

## The windowed system

Magnify is a **windowed** tool. Each action opens a **floating window** you manage like a desktop app — **move, resize, minimize, maximize, pin, close** — with a **taskbar** at the bottom. So you can watch a pod's **Logs** in one window while its **Metrics** update in another, side by side:

![Magnify floating log window](../../../_media/guide/channel-magnify-windows.png)

## LogSearch

**LogSearch** searches for text across the logs of **many pods/containers at once**, without opening individual log streams. Open it from the **Log search** button in the Magnify toolbar (the toolbar shows contextual actions like *Log search*, *Search* and *Topology* when you select a scope such as **Cluster → Overview**). Enter a term, pick a scope, and Magnify fans the query out to the backend and returns results **grouped by container**:

![Magnify LogSearch panel](../../../_media/guide/channel-magnify-logsearch.png)

| Option | Default | Notes |
|---|---|---|
| **Search term** | — | Plain text or JavaScript regex. |
| **Lines per container** | **100** | Maximum **500** (the cap keeps memory/latency sane). |
| **Scope** | all containers in view | Narrow to namespace / group / pod / container. |

- A **Stop** button (red) cancels an in-flight search immediately, on both frontend and backend.
- Searches are **concurrent** — each gets a unique id, so multiple LogSearch panels run and stop independently. Closing a panel auto-stops its search.

## User Preferences

Magnify has its **own Preferences** panel (left nav **Preferences**). It's an accordion; expanded, every section:

![Magnify preferences — all sections](../../../_media/guide/channel-magnify-preferences.png)

| Section | What it holds |
|---|---|
| **Display** | **Palette mode** (light/dark) and an **About** shortcut. |
| **Custom actions** | Define your own **actions** (e.g. *Forward*) with **ADD** / **REMOVE** — custom operations you can trigger on objects. |
| **External content** | **Max messages** kept for embedded external content. |
| **Data management** | Choose **what Magnify streams and keeps**: toggles **Keep Helm data** and **Keep managed fields**, plus a per-**resource-kind** checklist (Node, Namespace, Pod, Deployment, DaemonSet, ReplicaSet, StatefulSet, Job, CronJob, ConfigMap, Secret, Service, Ingress, PV/PVC, Roles & bindings, metrics, Endpoints, PriorityClass, RuntimeClass, VolumeAttachment, CRDs & instances, CSI objects, ServiceAccount, webhooks, Lease…). Untick a kind to stop streaming it — useful to cut noise/load on big clusters. |
| **Debug** | Inspect the client: **Files collection** (object cache size), **Metrics names**, **Channel object**, and **Message tracing** (log received messages to console), with **RELOAD** / **SHOW**. |
| **Extensions** | A **MANAGE** shortcut that opens the **Plugins / Providers / Senders** managers — so you can manage extensions **without leaving Magnify**. |

## Editors, validation, search & CRDs

- **Editors** — open any object's manifest, edit, and apply changes online.
- **Cluster validation** — Magnify surfaces inconsistencies/errors/warnings detected across your artifacts (a validation ribbon on the overview).
- **Full-text search** — search across all Kubernetes artifacts, not just logs.
- **CRDs** — browse and manage your Custom Resource Definitions and their instances under **Custom**.

## Desktop (Kwirth Magnify)

The **desktop** app is built for local work like Lens/K9s/Headlamp: instead of connecting to one cluster, it lists **all contexts in your local `kubeconfig`** (refreshing availability automatically) and lets you add **remote** clusters (Docker/External/Kubernetes Kwirth servers). See [Deployment → Desktop](../../admin/01-deployment).

## Admin guide

- **Built-in:** ships with the core; enable/disable at deploy (Helm `channelMagnify`, External `--channelmagnify`). Nothing to install in *Manage extensions*.
- **Permissions:** because Magnify can do *everything*, it honours the full scope model — browsing needs read/streaming scopes; editing/deleting/restarting and shells require the matching scopes (e.g. `ops$xterm`, `ops$restart`) on the target objects. Grant Magnify power deliberately (see [Security & permissions](../../admin/04-security-and-permissions)).
- **Trivy Operator:** Magnify can deploy the Trivy Operator to a cluster that doesn't have it, enabling vulnerability scans.

## Notes

- Magnify streams **live** — lists and metrics reflect the cluster as it changes, no refresh needed.
- It's a superset console: most things you'd do across several channels, you can do from Magnify's windows.

---

← Back to [Plugins (channels)](index)
