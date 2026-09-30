# Echo

A channel for **[Kwirth](https://kwirthmagnify.dev)** that **makes traffic on purpose**, so the pipeline
can be proved without waiting for a real workload to say something.

It attaches to the resources in your scope and emits a synthetic line per resource on a fixed interval — a
heartbeat you can watch arrive. Along the way it echoes back the plumbing: that the instance config was
accepted, which senders the backend has, and every container it resolved in scope.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **Smoke-testing a fresh deployment** — does streaming actually reach the browser?
- **Testing a sender end to end** — point Echo at a sender config and watch the destination receive the
  heartbeat. A sender that silently fails looks exactly like one that works until something proves otherwise.
- **Checking scope and discovery** — see precisely which containers Kwirth resolves for a selection.
- **Generating steady traffic** for a demo, or for exercising whatever you are building.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Echo** in the marketplace and install it.

## Configuration

The setup asks for the **interval** between heartbeats and, optionally, a **sender configuration** to
forward them to. Nothing else: everything this channel produces, it produces by itself.

It also subscribes to the **[OpenTelemetry provider](https://kwirthmagnify.dev)** when one is installed, so
OTLP traffic sent to Kwirth shows up here too — which makes it the quickest way to check that an exporter
is actually reaching the cluster.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"echo": "../plugins/echo/dist"`. The core
caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
