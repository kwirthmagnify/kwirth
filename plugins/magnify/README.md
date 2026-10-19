# Magnify

A channel for **[Kwirth](https://kwirthmagnify.dev)** that turns it into a **complete Kubernetes management
tool**, in the spirit of Lens, K9s or Headlamp: every artifact and every event of the cluster, live, and the
actions to manage them.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it does

- **Browse the whole cluster** like a file explorer: workloads, networking, config, storage, access control,
  custom resources — each kind in its own section, kept current as the cluster changes.
- **An overview** with the cluster's consumption (CPU, memory, network), the validation badges of every kind
  of object, and the latest Kubernetes events.
- **Details of any object**, with its events, its YAML (to edit and apply) and its relations.
- **Act on it**: scale, restart, delete, cordon / uncordon / drain a node, open a shell on a node, trigger or
  suspend a CronJob, set the default IngressClass, purge an image from every node…
- **Open other channels from it** (Log, Metrics, Fileman, Ops, Trivy, Topology…) on the object you are
  looking at, when they are installed.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Magnify** in the marketplace and install it. It
comes already installed in the `-full` image and in the desktop app.

It needs three other extensions, which the marketplace asks for when you install it:

- the **Events** provider (the live changes and the event lists),
- the **Metrics** provider (the consumption charts),
- the **`file-manager` DCE**, which provides the explorer it is drawn with.

The two providers come already installed in the images that carry channels (`-readonly`, `-full`) and in the
desktop app.

## Permissions

Since **0.2.0** Magnify checks who is asking. It declares three scopes, each granting everything below it:

- **`magnify$user`** — open it and see the cluster's health: its metrics and its events. It does **not**
  list resources.
- **`magnify$read`** — also see the **workloads and configuration**, with their contents. It can be
  narrowed from the security editor to **hide kinds** — typically ConfigMap and Secret.
- **`magnify$write`** — also change those: apply, delete, evict, scale, restart.

`cluster` and `admin` sit above all three, and the `Namespaces` of the key limit where it all applies.

🔴 **The infrastructure is behind `cluster`, not behind these.** Nodes, CRDs, PersistentVolumes,
ClusterRoles, StorageClasses — seeing them *or touching them* asks for `cluster`. That is the line
between a developer and an administrator: somebody with `magnify$write` deletes a pod and cannot drain a
node.

> ⚠️ **Before 0.2.0 it checked nothing**: any key that reached the channel saw the whole cluster. If
> somebody loses access after upgrading, that is why — grant them `magnify$user` or above.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
npm test                # harness
```

To run it from source, add it to `back/kwirth-dev.json` as `"magnify": "../plugins/magnify/dist"`. The core
caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
