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
