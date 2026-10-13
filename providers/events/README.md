# Events provider

The provider that streams **what changes in a Kubernetes cluster**, as it happens, to the channels of
**[Kwirth](https://kwirthmagnify.dev)**: pods, deployments, services, ingresses, secrets, nodes, CRDs and their
instances… and the cluster's own **Kubernetes Events** (BackOff, Scheduled, Pulled…).

A provider has no tab of its own: it produces data and hands it to the channels that subscribe to it. In Kwirth
those are **Magnify** (its live resource lists and its recent-events feed), **Topology**, **Pinocchio**,
**Censor** and others.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## Installing it

From Kwirth: **☰ → Manage extensions → Providers**, find **Events** in the marketplace and install it. It
already comes inside the Kwirth images that carry channels (`-readonly`, `-full`) and in the desktop app.

It needs a Kubernetes API behind Kwirth: without one (ECS, ACI, a container with no kubeconfig, the Helm `zero`
mode) there is nothing to watch, and the provider says so once in the log and stays idle. It needs a Kwirth
core with `kwirth-common-back` 0.6.2 or later: the Kubernetes watch it uses is the core's.

## What it delivers

**Push (subscription).** A subscriber sends `{ kinds, syncInstances }` and gets `{ type, obj }` for every
change from **now on** — not the current state — where `type` is `ADDED`, `MODIFIED` or `DELETED`. Strict opt-in:
only the kinds listed are delivered (`{}` receives nothing). Kubernetes Events arrive with `kind: 'Event'`, and
the backlog Kubernetes replays when a watch starts is not delivered again. Every CRD that appears is watched
too, and its instances reach the subscribers.

**Pull (one-off read).** Through the provider contract's `getData({ namespace?, kind?, name?, limit? })`, and
over HTTP behind the caller's access key at `/core/providerconfig/events?namespace&kind&name&limit` (capped at
500): Kubernetes Events, all or about one object, newest first.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
npm test                # unit tests, including a run against a fake API server (COVERAGE=1 for coverage)
```

To run it from source, add it to `back/kwirth-dev.json` as `"providers": { "events": "../providers/events/dist" }`.
A change to a provider's back end needs a **restart of the Kwirth back**.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
