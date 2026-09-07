# Provider Debug

Kwirth channel plugin for **inspecting what a provider actually emits**. It subscribes to a
running provider and streams every event it dispatches, verbatim, with no interpretation.

Use it when you are writing a provider, or a plugin that consumes one, and you need to see the
exact shape of the objects that reach `processProviderEvent`.

## What it can see

Kwirth only instantiates and starts the providers that some channel declares in its
`requirements.providers`. This plugin declares **none**, on purpose: a debugger must not start
Kafka connections or open syslog sockets as a side effect of being installed.

The consequence is that Provider Debug lists and attaches to the providers **currently
running** — those already required by another installed plugin. A provider that is installed
but has no consumer is not running, and will not appear.

Typical providers running on a stock deployment:

| Provider | Started because of |
|---|---|
| `events` | magnify, topology, iter, censor, agora, excubitor |
| `metrics` | magnify, alert, pinocchio, agora |
| `otel` | echo |
| `business` | censor, montag, pinocchio |
| `syslog` | montag |
| `trivy` | trivy, excubitor |

## Usage

1. Open a **Provider Debug** tab and start the channel (tab settings ⚙ → Start).
2. Pick a provider in the setup dialog and accept. Events start arriving.
3. To change provider: **Stop**, then **Start** again — the channel is not `modifiable`, so
   reconfiguring always goes through stop/start. The menu disables Start while it runs.

The first run with **(none)** is worth doing once: it subscribes to nothing and just prints the
catalogue of providers that are really alive, which is also what tells the setup dialog which
entries to flag as dead.

### Setup fields

| Field | Meaning |
|---|---|
| `Provider` | Provider to attach to. `(none)` attaches to nothing and just lists the running ones. |
| `Subscription payload (JSON)` | Passed verbatim as the `data` argument of `provider.addSubscriber(subscriber, data)`. Empty means `{}`. Validated before the dialog closes. |
| `Max events` | Ring buffer size. Older events are dropped. |

### Where the provider list comes from

One place: **`GET /core/providers`**. It is the core's complete view — installed provider
extensions *plus* the ones the core registers in code (`events`, `metrics`, flagged `core`) — and
each entry carries `running` and, when the provider publishes it, `subscriptionHelp`.

So the dropdown is populated *and* flagged before the channel has ever been started. Entries that
are known but not running are marked `not running`; subscribing to one returns a clear error
rather than silence.

The channel also broadcasts its own catalogue over the websocket when an instance starts. That
feeds the *Running providers* chips in the tab and acts as a fallback if the endpoint cannot be
reached, but it is no longer what drives the dropdown.

### Providers that document themselves

A provider can publish how to subscribe to it by implementing an **optional** method of
`IProvider`:

```ts
getSubscriptionHelp(): IProviderSubscriptionHelp
// { usage: string, example: Record<string, unknown>, fields?: IProviderSubscriptionField[] }
```

The channel calls it while building the catalogue, so the help travels with it and the setup
dialog can show:

- the `usage` prose above the payload editor,
- a **USE EXAMPLE** button that drops `example` into the payload,
- and, when `fields` is declared, a generated **Form** tab instead of hand-written JSON. Only
  declare `fields` for flat payloads; a nested one (otel's `spaces`) is better served by
  `usage` + `example` alone.

It is optional on purpose: a provider that does not implement it still works, the dialog just says
so instead of leaving you guessing. `events` and `metrics` implement it; use them as the reference.

Do not confuse it with the `schema` a provider exports from its `back.js` — that one describes the
provider's **own configuration** (`configure` / `configRouter`), not the subscription payload.

### In the tab

The header shows the provider, the buffer occupancy and the status, plus a **clear** button that
empties the captured events. Each event is collapsed behind a one-line summary (timestamp,
provider, top-level keys) and expands to the raw JSON, coloured by type.

### Subscription payload examples

Each provider defines its own subscription schema, and **most of them deliver nothing at all
with an empty payload** — this is the first thing to check when a debug tab stays silent.

```json
{ "pod": true, "container": true, "machine": true }
```
`metrics` — pushes to every subscriber on each tick (`metricsInterval`, 15 s by default),
regardless of the payload. The easiest provider to confirm the channel works end to end.

```json
{ "kinds": ["Pod", "Event"] }
```
`events` — strict opt-in. `dispatch()` only delivers objects whose `kind` is listed in `kinds`,
so subscribing with `{}` yields **no traffic ever**. Note the watchers start with the provider,
not with your subscription, so you see changes from now on, not the current state of the cluster.

```json
{ "spaces": [ { "name": "debug", "signals": ["traces", "metrics", "logs"] } ] }
```
`otel` — pick which OTLP signals to receive.

## How the subscription works

Providers keep their subscribers in a `Map` keyed by the subscriber **object**. If the channel
registered itself, only one subscription per provider would fit, with a single payload, and two
users debugging the same provider would overwrite each other.

So every instance registers its **own** lightweight subscriber proxy:

```
{ processProviderEvent: (providerId, obj) => deliver(...) }
```

Each instance therefore gets its own entry in the provider's map and its own payload, and
`removeSubscriber` on stop only removes that one.

## Wire protocol

The back sends a single message type, `providerdebugmessageresponse`, discriminated by
`payloadType`:

```json
{ "payloadType": "providers", "providers": [ { "id": "events", "providesRouter": false } ] }
{ "payloadType": "event", "event": { "ts": 1757000000000, "providerId": "events", "event": { } } }
```

Errors (provider not running, malformed payload) arrive as `SIGNAL` messages and are shown in
the tab.

## Status

**F1** — back complete: catalogue of running providers, per-instance subscriber proxy, raw event
delivery, pause, teardown and reconnection.

**F2 (in progress)** — provider dropdown, collapsible JSON per event, clear button, and the
not-started notice. Still pending: text filter over the buffer, autoscroll, buffer export, and
`modifiable: true` so the provider can be swapped without stop/start.
