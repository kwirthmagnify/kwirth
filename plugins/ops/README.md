# Ops

The **day-to-day operations** console for **[Kwirth](https://kwirthmagnify.dev)**: what you would reach
for `kubectl` to do, done from the screen you are already looking at.

Open a **shell** into a container, **restart** a container, a pod or a whole namespace, **inspect** an
object, and jump straight from any of them to its **logs** or its **metrics** — pointing and clicking,
with the same permissions Kwirth already knows you have.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **Acting on what you just saw**, without changing tool and losing the context.
- **Giving someone the ability to restart a pod** without giving them a kubeconfig.
- **Getting into a container** from a machine that has no `kubectl` at all.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Ops** in the marketplace and install it.

⚠️ This channel **changes things**: a shell and a restart are exactly what they sound like. It declares
its own RBAC scopes, and they are the ones to be careful with — grant them to whoever you would trust
with `kubectl exec` and `kubectl delete pod`.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"ops": "../plugins/ops/dist"`. The core
caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
