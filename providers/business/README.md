# Business Provider

Installable Kwirth **provider** that ingests arbitrary business events over HTTP and dispatches
them to subscribing channels, grouped by **spaces** and **types**.

It is the generic "push me any JSON event" provider: an external system POSTs events to Kwirth, the
provider keeps an in-memory accumulated store and fans each event out to the channels interested in
that space/type (e.g. `censor`, `pinocchio`, `montag`).

> This provider was previously built into the Kwirth core. It now ships as an independent installable
> provider (same model as `kafka`), so it can be installed/uninstalled on demand.

## HTTP ingestion endpoint

The provider exposes a single ingestion route, mounted under the provider alias convention:

```
POST {clusterUrl}/provider/business
Content-Type: application/json
Authorization: Bearer <accessKey>

{
  "space": "orders",
  "type": "created",
  "data": { "orderId": 1234, "total": 99.9 }
}
```

- `space` (string, required) — logical domain the event belongs to.
- `type` (string, required) — event type within the space.
- `data` (any JSON, optional) — the payload; the provider stores/forwards it verbatim without inspecting it.

Responses: `200` on accepted, `400` if `space`/`type` are missing, `500` on internal error.

## Subscriber config

A channel subscribes by declaring `business` in its `requirements.providers` and calling
`addSubscriber('business', this, config)` with:

```ts
interface IBusinessProviderConfig {
    spaces: {
        name: string      // space to listen to
        types: string[]   // allowed types; an event is delivered only if its type is in this list
                          // (empty list = nothing delivered for that space — list every type explicitly)
    }[]
}
```

Example — subscribe to `created`/`shipped` of `orders` and `authorized`/`refunded` of `payments`:

```ts
this.clusterInfo.addSubscriber('business', this, {
    spaces: [
        { name: 'orders',   types: ['created', 'shipped'] },
        { name: 'payments', types: ['authorized', 'refunded'] }
    ]
})
```

## Event delivered to subscribers

When an incoming event matches a subscriber's spaces/types, the provider calls
`processProviderEvent('business', event)` with:

```ts
interface IBusinessProviderEvent {
    last: {
        type: string      // 'event'
        timestamp: string // epoch millis as string
        event: unknown    // the full ingested body { space, type, data }
    }
    all: Map<string, Map<string, unknown[]>>   // accumulated store: space -> type -> events[]
}
```

## Build

```bash
npm install
npm run build     # → dist/back.js + dist/package.json
npm run watch     # rebuild on change (kwirth hot-reloads dev providers)
```

## Install into Kwirth

- **Production**: publish `dist/` to npm and install the provider from the Kwirth admin UI
  (Manage → Providers), or via a tar.gz URL.
- **Dev**: add it to `kwirth-dev.json` so the backend loads it from disk:

```json
{
  "providers": {
    "business": "../providers/business/dist"
  }
}
```
