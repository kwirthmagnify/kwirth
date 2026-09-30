# Trivy

A channel for **[Kwirth](https://kwirthmagnify.dev)** that brings **security and vulnerability scanning**
into the console, powered by [Trivy](https://trivy.io) (Aqua Security).

It streams, in real time, the **vulnerabilities, config-audit findings, exposed secrets and SBOM** of the
Kubernetes objects in your scope, and rolls them up into a score you can watch move — so "are we better
than last week" has an answer that is not a feeling.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **Seeing what is actually deployed**, not what the last pipeline scan said about an image.
- **Finding a secret that ended up in a manifest**, before somebody else does.
- **Tracking posture over time**, per namespace or per workload.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Trivy** in the marketplace and install it. It
requires the **Trivy provider**, which the marketplace installs with it.

⚠️ **The scanning is not done by Kwirth.** This channel reads what **Trivy Operator** has already written
as CRDs in your cluster, so the operator has to be installed and running: without it there are no reports
to show, and an empty screen means exactly that.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"trivy": "../plugins/trivy/dist"`. The core
caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
