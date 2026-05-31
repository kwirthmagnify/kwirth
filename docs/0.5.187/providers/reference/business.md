# Business

The Business provider bridges external business systems with Kwirth. It exposes an **HTTP POST endpoint** that any external service can call to push business events into Kwirth. Those events are then distributed to all channels that have subscribed to the relevant space/type combination — enabling channels like [Pinocchio](../../channels/pinocchio) and [Censor](../../channels/censor) to react to business data in real time.

## What for

  - Feed business metrics, KPIs, or operational events (order status, customer health scores, branch activity...) into Kwirth channels.
  - Let the Pinocchio AI channel correlate business events with Kubernetes activity.
  - Trigger LLM analysis or sender notifications when specific business conditions occur.

## Features

  - **HTTP ingestion** — accepts `POST` requests at the provider endpoint; no Kubernetes dependency needed on the sender side.
  - **Space / type routing** — events carry a `space` and `type` label; subscribers receive only the events matching their subscription.
  - **In-memory accumulation** — all received events are kept in memory grouped by `(space, type)` and passed to subscribers both as the latest event and as the full historical map.

## Event format

POST body (JSON):

```json
{
  "space": "customers",
  "type": "status",
  "data": { "customerId": "C-001", "health": 0.82 }
}
```

- `space` — logical namespace for the data domain (e.g. `"customers"`, `"branches"`, `"orders"`).
- `type` — event sub-type within that space (e.g. `"status"`, `"alert"`, `"immediate"`).
- `data` — arbitrary JSON payload; structure is defined by the producer.

## Endpoint

```
POST <kwirth-base-url>/provider/business
```

## Use

To subscribe a channel to the Business provider:

```typescript
this.clusterInfo.addSubscriber('business', this, {
    spaces: [
        { name: 'customers', types: ['status'] },
        { name: 'branches',  types: ['status', 'alert'] }
    ]
})
```

Each call to `processProviderEvent` receives:

```typescript
{
    last: {
        type: 'event',
        timestamp: string,   // Date.now() as string
        event: { space, type, data }
    },
    all: Map<space, Map<type, event[]>>
}
```

Use `last.event.data` to access the latest payload, or `all` to traverse the full history for any space/type combination.
