# Alert

A channel for **[Kwirth](https://kwirthmagnify.dev)** that raises an alert the moment something you care
about happens, instead of leaving it in a log for somebody to find later.

It watches two kinds of trigger: **log lines matching a regular expression**, at three severities, and
**metric rules** — a value crossing a threshold you set. When one fires you get it on screen, and, if you
point the channel at a **sender**, at whatever destination that sender delivers to.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it is for

- **Catching a known bad line** — a stack trace, an `OOMKilled`, a specific error string — as it is written.
- **Watching a number** — memory, CPU, whatever the metrics provider exposes — against a threshold.
- **Getting told somewhere else**: mail, a Teams channel, a file, a ticket. Whatever sender you have.

## Installing it

From Kwirth: **☰ → Manage extensions → Plugins**, find **Alert** in the marketplace and install it.

## Configuration

The setup dialog takes the regular expressions for **Info**, **Warning** and **Error**, the **metric
rules** (metric, operator, value, severity), how many alerts to keep, and optionally a **sender** with one
of its configurations. A rule with no sender still shows on screen — the sender is how it leaves Kwirth.

The user guide, with screenshots, lives in the Kwirth documentation:
**https://kwirthmagnify.dev** → Guide → Extensions → Plugins → Alert.

## Development

```
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"alert": "../plugins/alert/dist"`. The core
caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
