# Provider Debug

The **Provider Debug** plugin is a diagnostic channel: it subscribes to a running **provider** and shows every event it dispatches, **exactly as emitted** — no parsing, reshaping, or filtering. Use it while building a provider (confirm your events arrive in the shape you intended), building a plugin that consumes one (see the real payload before coding against it), or troubleshooting a channel that receives nothing.

It declares **no provider requirements** of its own, so installing it never opens a socket or connects to a broker. The setup dropdown lists every provider the core knows — installed extensions plus the built-in ones — and marks those that are **not running** (installed but unused; subscribing fails until some channel requires them).

**Instance config (`IProviderDebugInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `providerId` | `string` | `''` | Id of the provider to subscribe to. Empty = not subscribed — the tab just lists what is alive. |
| `subscriptionData` | `string` | `'{}'` | Raw subscription payload (JSON), passed verbatim to the provider on subscribe. Most providers deliver nothing with an empty payload. |

**Channel config (`IProviderDebugConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `maxEvents` | `number` | — | Size of the ring buffer; older events are dropped when it fills. |

Providers may publish **subscription help** via `getSubscriptionHelp()`: when present, the setup dialog shows usage notes, a **USE EXAMPLE** button, and — for flat payloads — a generated form so you do not have to write JSON by hand. Provider Debug is cluster-scoped (set **View** to `cluster`); start it from the tab's **⚙️ → Start**.

See the [Provider Debug guide](/0.5.287/guide/extensions/plugins/provider-debug) and [Developing providers](/0.5.287/providers/developing) (including how to publish subscription help from your own provider).
