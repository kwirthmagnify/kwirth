# Log

The channel that streams **container logs in real time** in **[Kwirth](https://kwirthmagnify.dev)** — the
one most people open first.

What it shows follows the scope you pick: a whole cluster, one or more namespaces, a controller's pods,
specific pods, or a single container. Whatever the selection, the lines are merged into one live stream,
colour-coded by origin, so following a request across three pods does not mean three windows.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **Watching a deployment roll** and seeing every new pod join the stream on its own.
- **Following one request** across the services that handled it, in one place.
- **Keeping an eye on a namespace** without picking pods by hand.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Log** in the marketplace and install it.

## Configuration

The setup covers what you would expect of a log viewer: how much history to bring on start, timestamps,
and whether to follow. Everything else is the scope you chose before opening the tab.

The user guide, with screenshots, lives in the Kwirth documentation:
**https://kwirthmagnify.dev** → Guide → Extensions → Plugins → Log.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"log": "../plugins/log/dist"`. The core
caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
