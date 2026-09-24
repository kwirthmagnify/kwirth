# Kwirth Status

A look inside Kwirth: **what is installed, how it is doing, and — soon — who consumes what.**

Kwirth knows a lot about your cluster and almost nothing about itself. When a provider does not start, when
an extension needs a restart, or when something is installed but nothing consumes it, the symptom you see
rarely looks like the problem. This channel puts that state on a screen.

## What it shows

An inventory of everything this Kwirth has mounted — providers, pluviders, senders and webhooks — each with
its state **and the reason for it**:

| State | Meaning |
|---|---|
| **Running** | instantiated and working |
| **Not started** | installed, but the core never started it — the reason says why |
| **Needs restart** | running, but something of it is not wired in until the server restarts |
| **Failed** | it tried to start and failed |
| **Not reported** | the component does not expose that information (this is *not* an error) |

That last column — **why** — is the point of the whole screen. A bare *"not running"* is what you already
have today, and it does not get anyone anywhere.

## What it is not

- **Not a monitoring platform.** No time series, no alerts, no history. It shows *now*. Your Prometheus
  already covers CPU and memory of the pod, with more history and better alerting.
- **Not a debugger.** It never shows payloads. To inspect what a provider actually emits, use
  [`provider-debug`](../provider-debug), which is built for whoever *writes* a provider. This one is for
  whoever *operates* a Kwirth.
- **Not free-for-all.** The inventory is a privileged view, so it needs its own RBAC scope at `cluster`
  level.

## Cost

**Zero when nobody is looking.** There is no timer, no collection and no subscription: with the tab closed
this plugin does not execute a single instruction. When you open it, it reads state that is already in
memory and sends one snapshot. The snapshot does not refresh on its own — press refresh for a new one.

That is a deliberate product decision, not an optimisation pending: Kwirth sits in the path of your logs,
and a tool that watches it cannot slow it down.

## Configuration

None. Open it and it shows what this Kwirth has inside.

## Install

From the marketplace (**☰ → Extensions → Plugins**), or by URL:

```
https://registry.npmjs.org/@kwirthmagnify/kwirth-plugin-status/-/kwirth-plugin-status-<version>.tgz
```

## Development

```bash
npm install
node build.mjs          # typechecks first, then builds dist/front.js and dist/back.js
```

To run it from source, add it to `back/kwirth-dev.json`:

```json
"plugins": { "status": "../plugins/status/dist" }
```

⚠️ The core caches a plugin's `back.js`, so after building you have to **restart the Kwirth back**; the
front reloads on its own.

## Roadmap

| | |
|---|---|
| **S1** ✅ | the inventory with real state |
| **S2** | `getStats?()` in `IProvider` → who consumes what, and *active* vs *idle* |
| **S3** | the dependency diagram, with the same library Iter uses |
| **S4** | per-component counters, on while you watch and off when you close |

Product decisions and rationale live in [`plans/kwirth-status/`](../../plans/kwirth-status/).
