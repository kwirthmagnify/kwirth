# HTTP Pull-Push Provider

Installable Kwirth **provider** that **pulls** remote HTTP endpoints on a schedule and **pushes** each
result to the channels subscribed to it.

It is the generic "go and fetch this URL every N seconds for me" provider: you declare a set of
connections (an RSS feed, a quotes API, a news endpoint…) and any channel can subscribe to the ones it
cares about. One connection is fetched **once per cycle** no matter how many channels are listening.

## Two layers

The configuration has two layers that never mix.

**Layer 1 — connections.** They belong to the provider, are persisted, and exist even if no plugin is
installed. Each one has an `enabled` flag: a disabled connection is created but **not operative** — it is
stored and listed, but it has no timer and emits nothing.

**Layer 2 — subscriptions.** Declared by each channel when it subscribes, live in memory, and only say
*which* connections it wants:

```ts
this.clusterInfo.addSubscriber('http-pull-push', this, { configs: ['stocks', 'rss'] })
```

- `configs: ['a','b']` — only those.
- `configs: []` — nothing.
- `configs` absent — every enabled connection, including ones created later.

`updateSubscription()` changes the selection without unsubscribing and subscribing again.

## What a subscriber receives

Every result is wrapped in an envelope. The wrapper exists because `processProviderEvent(providerId, obj)`
carries no connection identity: without it, a channel subscribed to several connections could not tell the
streams apart.

```ts
// success
{ config: 'stocks', timestamp: 1757155200000, status: 200, data: { price: 42 } }

// failure (timeout, DNS, connection refused, retries exhausted…)
{ config: 'stocks', timestamp: 1757155200000, error: 'timeout after 10000ms' }
```

`data` is the response body: parsed when `responseType` is `json`, raw text when it is `text`. A body that
claims to be JSON but is not is delivered raw rather than dropped.

## Configuration

Set it from the card's **⚙️ gear** in **☰ → Manage extensions → Providers**. Each connection has:

| Field | What it does |
|---|---|
| `name` | Identifies the connection. It is what subscribers name and what travels in the envelope. |
| `enabled` | `false` = created but not operative. |
| `url` | `http://` or `https://`. |
| `method` | GET / POST / PUT / PATCH / DELETE. |
| `headers` | Sent verbatim on every request. |
| `body` | Only for POST/PUT/PATCH. Defaults to `Content-Type: application/json` if you set none. |
| `intervalSeconds` | How often the pull fires. |
| `timeoutMs` | Per request. Must not exceed the interval, or the pulls would overlap. |
| `auth` | `none`, `basic` (user + password), `bearer` (token) or `header` (name + value). |
| `responseType` | `json` parses the body, `text` delivers it raw. |
| `emitMode` | `always` emits every cycle; `onChange` only when status or body differ from the previous one. |
| `retries` | Extra attempts within the same cycle before reporting an error. |
| `allowInsecureTls` | Accepts self-signed certificates. Only meaningful on `https://`. |

Changes apply **hot**: enabling, disabling, adding, editing or deleting a connection takes effect on save,
with no Kwirth restart.

### Where it is stored

The provider owns its configuration and splits it by sensitivity, the same way channels do:

- `kwirth-store-provider-http-pull-push-configs` → **ConfigMap**: names, urls, intervals, headers, flags.
  Still inspectable with `kubectl`, which is useful to audit what is being queried.
- `kwirth-store-provider-http-pull-push-creds` → **Secret**: `password`, `token` and header value.

It does **not** use `configure()` nor the core-managed provider ConfigMap. Its own endpoints are mounted by
the core at `/core/providerconfig/http-pull-push`, always behind accessKey validation:

- `GET /configs` — the connection list.
- `PUT /configs` — replaces it (validated, persisted and applied live).

Requires a Kwirth core that injects provider storage (`@kwirthmagnify/kwirth-common-back >= 0.5.37`).

## Polling is lazy

A connection is polled **only while at least one subscriber wants it**. With nobody listening there is no
traffic: no hammering endpoints nobody reads, and no burning the quota of a paid API because of a
forgotten connection. So `enabled` really means "available to subscribe to".

The first pull happens as soon as someone subscribes — whoever just subscribed should not have to wait a
whole interval. And if a cycle is still in flight when the next one is due, that cycle is skipped: the
interval sets the pace, not the latency of a slow endpoint.

## Development

```
npm install
npm run watch     # rebuilds dist/back.js (and dist/front.js) on every change
npm test          # node:test suite, no network involved
```

Register it in `back/kwirth-dev.json` under `providers` to have the dev core load it from `dist/`.
