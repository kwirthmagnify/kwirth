# Routers

A **router** is a back-only Kwirth extension with a single job: **carrying the core's traffic to a cluster that
cannot be reached directly** (behind NAT, a firewall, a DMZ). It has no tab and no panel: it is installed and
configured in the **Routers** manager, and it speaks through the core's log.

How it fits:

- A cluster-list entry keeps the cluster's **real** URL, plus a **route**: which router reaches it and the target
  cluster's uid (*Manage clusters* → *Route*).
- Every request and WebSocket for that cluster goes to `<rootPath>/router/<id>/…` on **this** core. The core
  **authenticates** it (route ticket, access key or loopback) and hands it to the router with who is calling; the
  router **authorizes** it and carries it, however it likes (a tunnel, a bastion, a proxy…).
- Installing, updating and uninstalling a router needs **no restart**.

A plugin that is also a router (it has a panel of its own) is a **pluter**.

## Writing one

- Contract: `IRouter` in `@kwirthmagnify/kwirth-common-back`; `IRouterData` and the route types in
  `@kwirthmagnify/kwirth-common`.
- Scaffolder: `node tools/create-kwirth-router.mjs --id <id>`.
- Reference router: **[bridge](https://github.com/jfvilas/kwirth/tree/master/routers/bridge)** — two Kwirths that
  reach each other through one outbound link.
- Product and plan: [plans/router-extension](../plans/router-extension/PRD.md).

> ⚠️ Work in progress: the type is being built (see the plan). Until it ships, this folder only holds this README
> and the official routers' marketplace manifest, [`manifest.json`](manifest.json).

## Layout

```
routers/manifest.json   the official routers' marketplace manifest
routers/<id>/           one router per folder (a new one is PRIVATE until listed in .gitignore as an exception)
```
