# News

A channel for **[Kwirth](https://kwirthmagnify.dev)** that puts a **curated tech news feed** next to your
clusters.

It pulls from public RSS sources on two topics — **Kubernetes** and **AI** — and shows them as a clean
chronological list, so keeping an eye on the ecosystem does not mean leaving the console you already have
open all day.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **A tab that is not an incident**, on a screen that usually is.
- **Catching a release or an advisory** in the ecosystem you run on.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **News** in the marketplace and install it.

⚠️ It fetches from **public sources on the internet**: a Kwirth with no outbound access will show an
empty feed, and that is the reason rather than a fault.

## Configuration

The setup picks the **topic** and how many items to keep. Nothing else: the sources are the plugin's.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"news": "../plugins/news/dist"`. The core
caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
