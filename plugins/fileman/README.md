# Fileman

A channel for **[Kwirth](https://kwirthmagnify.dev)** that turns any running container into a **file
manager**, inside the browser.

Browse the container's filesystem, view and edit text and config files in place, and upload, download,
copy, move, rename, create and delete — without `kubectl cp`, without `kubectl exec`, and without a shell
on the machine you happen to be sitting at.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **Reading a config the container actually has**, not the one you think you mounted.
- **Fixing a file in place** while you work out what is wrong.
- **Getting a file out** — a heap dump, a core, a log that never made it to stdout.
- **Putting a file in** for a test, without rebuilding an image.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **File Manager** in the marketplace and install it.

⚠️ It reaches the container's filesystem, so treat access to it as you would a shell: give the scope to
whoever you would let in with `kubectl exec`, and no one else. Its RBAC scopes are declared by the plugin
and manageable from Kwirth's security screens: `fileman$user` browses, `fileman$read` opens and downloads,
`fileman$write` modifies.

🔴 **Upgrade to 0.2.29 if you are on an earlier version.** Until it, only the scope was checked and not
the TARGET: a session opened on a container the key allowed could read and write **any container in the
cluster** by changing the path in the request. Both are now enforced, on every path — browsing included.

⚠️ The namespaces, pods and containers of a key are **regular expressions matched anywhere in the name**,
so a grant on `kwirth` also reaches `kwirth-system`. Write `^kwirth$` to mean one and no other.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"fileman": "../plugins/fileman/dist"`. The
core caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on
its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
