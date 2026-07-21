# Topology
Topology channel renders an **interactive 3D graph** of all the Kubernetes resources running in your cluster. Nodes represent Kubernetes objects (Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, Pods, Containers, Services, Ingresses, PersistentVolumeClaims) and edges represent relationships between them — ownership chains, service bindings, and ingress routing paths.

The view updates in real time as resources are created, modified or deleted in the cluster.

## What for
With Topology channel you can:

  - Get a live bird's-eye view of your entire cluster — or filter to a specific namespace or resource group.
  - Understand relationships between objects at a glance (which pods belong to which deployment, which service exposes which pods, which ingress routes to which service).
  - Spot unhealthy resources immediately: each node is color-coded by its current status (Running, Pending, Failed, Terminating...).
  - Perform management operations without leaving the topology view: scale a Deployment, restart a controller, or delete a pod directly from the graph.

## Features
Key features of Topology channel:

  - **Real-time sync** — Kubernetes events (ADDED / MODIFIED / DELETED) update the graph as they happen.
  - **Hierarchical 3D layout** — resources are arranged in layers by kind, making it easy to trace relationships top-down.
  - **Configurable visibility** — toggle which resource types to show or hide from the setup dialog.
  - **Animated edges** — relationship edges are animated to make data flow and ownership chains visually intuitive.
  - **Operations** — scale Deployments and StatefulSets, restart controllers, delete pods, all from the graph.
  - **Multi-namespace view** — show resources across all namespaces in one unified graph.
  - **Integration with other channels** — Topology can launch Log, Metrics, Fileman or shell sessions for a selected object directly from the graph node.

## Use
Starting Topology is simple. Select any resource in the resource selector (the namespace is enough) and add a new Topology tab. No detailed configuration is required to get started.

The optional setup dialog lets you control:

  - **Which resource types** to show (Pods, Services, Ingresses, PVCs, etc.).
  - **Label size** and **node spacing** for adjusting the visual density of the graph.
  - **Edge animation** on or off.

![topologysetup](../_media/ch-images/topology-setup.png ':class=imageclass60')

Once started, the 3D graph appears in the tab and begins populating with live data from the cluster.

![topologynavigate](../_media/ch-images/topology-navigate.png ':class=imageclass60')

You can click any node to select it and see its details. When one or more nodes are selected, the action toolbar shows the operations available for that resource type.

![topologycontextmenu](../_media/ch-images/topology-contextmenu.png ':class=imageclass60')
