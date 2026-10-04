# Topology

A channel for **[Kwirth](https://kwirthmagnify.dev)** that draws a **live, interactive 3D map** of the
cluster and how its pieces are wired together.

Ingresses, Services, workloads (Deployments, StatefulSets, DaemonSets, Jobs, CronJobs), ReplicaSets, Pods,
Containers and PersistentVolumeClaims, laid out in layers with the relationships between them drawn —
Ingress at the top, down to what actually runs. It follows the cluster as it changes, so a rollout is
something you watch happen rather than something you reconstruct afterwards.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **Seeing what reaches what** — which Service that Ingress really points at, which pods are behind it.
- **Understanding a namespace you did not build**, faster than by reading manifests.
- **Watching a rollout**, with pods appearing and going as they do.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Topology** in the marketplace and install it.
It consumes Kwirth's **events** provider to keep the map current, which the core provides.
The 3D rendering uses [three.js](https://threejs.org/), shared via the **DCE `three`** — the marketplace
installs it automatically as a dependency.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"topology": "../plugins/topology/dist"`. The
core caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on
its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
