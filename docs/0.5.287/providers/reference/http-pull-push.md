# HTTP Pull-Push

Polls remote HTTP endpoints on a schedule and pushes each result to the subscribing channels. It is the
**pull** counterpart of Business/OTLP: those wait for an external system to POST data into Kwirth, this one
goes out and fetches it.

Installable provider, package `@kwirthmagnify/kwirth-provider-http-pull-push`. Requires a core that injects
provider storage (`@kwirthmagnify/kwirth-common-back >= 0.5.37`).

## Configuration model

Two independent layers.

**Layer 1 — connections.** Owned and persisted by the provider, managed from its own dialog. They exist with
no channels installed.

```ts
interface IHttpPullConfig {
    name: string                 // identity; travels in every event
    enabled: boolean             // false = stored but not operative
    url: string                  // http:// or https://
    method: EHttpMethod          // GET | POST | PUT | PATCH | DELETE
    headers: Record<string,string>
    body?: string                // POST/PUT/PATCH only
    intervalSeconds: number
    timeoutMs: number            // must not exceed the interval
    auth: IHttpAuth              // none | basic | bearer | header
    responseType: EResponseType  // json (parsed) | text (raw)
    emitMode: EEmitMode          // always | onChange
    retries: number              // extra attempts within the same cycle
    allowInsecureTls: boolean    // https only
}
```

**Layer 2 — subscription.** Declared by the channel, in memory:

```ts
this.clusterInfo.addSubscriber('http-pull-push', this, { configs: ['stocks', 'rss'] })
```

| `configs` | Meaning |
|---|---|
| `['a','b']` | Only those connections |
| `[]` | Nothing |
| absent | Every enabled connection, including ones created later |

Subscribing to an unknown or disabled connection is ignored and logged — never a failed subscription.
`updateSubscription()` changes the selection without unsubscribing.

The provider publishes `getSubscriptionHelp()`, so a consumer that lets the user pick a provider — the
**Provider Debug** channel, for instance — can show what to write, including the two things nobody guesses:
that `configs: []` delivers **nothing**, and that polling is lazy so nothing happens until you subscribe.

## Event delivered

```ts
interface IHttpPullPushEvent {
    config: string        // which connection produced it
    timestamp: number
    status?: number       // HTTP status, on success
    data?: unknown        // parsed body (json) or raw text
    error?: string        // on failure; data and status absent
}
```

The `config` field is not decoration: `processProviderEvent(providerId, obj)` carries no connection
identity, so without it a channel subscribed to several connections could not tell the streams apart.

## Behaviour

- **One request per cycle per connection**, fanned out to every subscriber. Subscriber count never
  multiplies the load on the remote endpoint.
- **Lazy polling.** A connection is polled only while at least one subscriber wants it; the first pull is
  immediate when someone subscribes, and polling stops when the last one leaves.
- **Overlap protection.** If a cycle is still in flight when the next is due, that cycle is skipped: the
  interval sets the pace, not the latency of a slow endpoint.
- **Hot-apply.** Saving the configuration reconciles the running pollers in place — starts the new ones,
  stops the removed or disabled ones, recreates the ones whose parameters changed. No restart.
- **onChange** compares status plus raw body against the previous cycle. After an error, the next good
  result is always emitted, so a subscriber sees the recovery instead of being left with the failure.
- A body declared as JSON that does not parse is delivered **raw** rather than dropped.

## Persistence

The provider owns its configuration and splits it by sensitivity:

| Storage key | Backing object | Contents |
|---|---|---|
| `http-pull-push-configs` (`secret=false`) | ConfigMap `kwirth-store-provider-http-pull-push-configs` | names, urls, intervals, headers, flags |
| `http-pull-push-creds` (`secret=true`) | Secret `kwirth-store-provider-http-pull-push-creds` | password, token, custom header value |

It does **not** use `configure()` nor the core-managed provider config. Its management endpoints are mounted
by the core behind accessKey validation:

```
GET  {clusterUrl}/core/providerconfig/http-pull-push/configs   → the connection list
PUT  {clusterUrl}/core/providerconfig/http-pull-push/configs   → replaces it (validated, persisted, applied live)
```

`PUT` answers `400` with `{ errors: string[] }` when a connection is invalid: no name, duplicated name,
a url that is not http(s), a non-positive interval or timeout, a timeout longer than the interval, or an
auth mode missing its required field.

## Security

Each connection is an **outbound call with Kwirth's own network identity**: whatever the pod can reach, a
connection can reach, internal services included. `allowInsecureTls` disables certificate verification for
that connection only. Response bodies are handed to subscribers verbatim — treat untrusted endpoints
accordingly.
