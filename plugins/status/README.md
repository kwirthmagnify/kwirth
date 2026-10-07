# Kwirth Status

A channel for **[Kwirth](https://kwirthmagnify.dev)** that looks inside Kwirth itself: **what is installed,
how it is doing, who consumes what, how much it moves, what the process is using, which HTTP routes it
publishes, and its own log.**

Kwirth knows a lot about your cluster and almost nothing about itself. When a provider does not start, when
an extension needs a restart, or when something is installed but nothing consumes it, the symptom you see
rarely looks like the problem. This channel puts that state on a screen — for whoever **operates** a Kwirth.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## What it shows

Eleven tabs, and it opens on the first:

| Tab | What it answers |
|---|---|
| **Home** | one card per tab with its figures; click a card to open its tab. The **Plugins & extensions** card unifies both (it opens Plugins; an "extensions" chip opens Extensions) |
| **Providers** | each producer of data — providers and pluviders — with its state and why, consumers and deliveries |
| **Graph** | who consumes whom |
| **Performance** | the Kwirth process: memory, CPU, event-loop delay and uptime, with charts of the session |
| **Plugins** | every installed plugin: running, remote, not started or failed, and how many instances and connections its channel reportsG (a dash when it does not report — never a zero) |
| **Extensions** | senders and webhooks, with their state |
| **Routes** | every HTTP route published — core API, providers, plugins, webhooks — with its methods, and collisions marked |
| **DCE** | every installed DCE: version, source, whether its back and front loaded (with the error), and who consumes it |
| **Log** | the core's own log, opened at its newest lines (admin only) |
| **Previous log** | the log of the previous container after a restart, and how it ended (admin only) |
| **SQL** | the core's relational storage — PostgreSQL via knex: connection config (no password), driver versions, reachability, the list of databases and per-consumer connection pool stats (used / free / max) |

**The inventory** — every provider, pluvider, sender and webhook this Kwirth has mounted, each with its
state **and the reason for it**:

| State | Meaning |
|---|---|
| **Active** | running, and something consumes it |
| **Idle** | running, and emitting to nobody |
| **Running** | running; it does not say how many consumers it has |
| **Not started** | installed, but the core never started it — the reason says why |
| **Needs restart** | running, but something of it is not wired in until the server restarts |
| **Failed** | it tried to start and failed |

The **why** is the point of the screen: a bare *"not running"* gets nobody anywhere. Alongside it, how many
**consumers** each producer has and how much it has **delivered**, with a rate between two snapshots.
A value a component does not report is shown as a dash, never as a zero.

**The graph** — who consumes whom, top to bottom: producers on top, channels at the bottom, and a provider
that consumes another provider in between, below the one it reads. A line **moves** only when its producer
delivered something since the previous snapshot; with auto-refresh it slows down and stops as the next
snapshot arrives.

**Refresh** — manual, or every 5s / 15s / 30s / minute while the tab is open.

## What it is not

- **Not a monitoring platform.** No history and no alerts: it shows *now*.
- **Not a debugger.** It never shows payloads. To inspect what a provider emits, use Kwirth's
  **provider-debug** channel, built for whoever *writes* a provider.

## Cost

**Zero when nobody is looking.** No background timer, no collection, no subscription: with the tab closed
this plugin does not run a single instruction. Opening it reads state that is already in memory.

## Install

In Kwirth, from the marketplace: **☰ → Extensions → Plugins**, find **Kwirth Status**, install. Or by URL:

```
https://registry.npmjs.org/@kwirthmagnify/kwirth-plugin-status/-/kwirth-plugin-status-<version>.tgz
```

No configuration. The inventory is a privileged view: it needs **cluster** scope, and the two log tabs
need **admin**. The Plugins, Routes and DCE tabs need a Kwirth core that lists its plugins, routes and DCEs; with an older one they say so.

## Development

Part of the Kwirth repository, in `plugins/status`:

```bash
npm install
node build.mjs          # typechecks, then builds dist/ (front.js, back.js, package.json, README.md)
npm test                # harness; COVERAGE=1 npm test for coverage
node watch.mjs          # rebuilds on every change, without typecheck
```

To run it from source, add it to `back/kwirth-dev.json` as `"status": "../plugins/status/dist"`. The core
caches a plugin's `back.js`: after a back change, **restart the Kwirth back**; the front reloads on its own.

## License

Same as Kwirth — see https://github.com/kwirthmagnify/kwirth.
