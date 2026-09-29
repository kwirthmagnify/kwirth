# Sender Debug

The **Sender Debug** plugin is a diagnostic channel and the outbound twin of [Provider Debug](provider-debug): pick a sender, pick one of its configurations, write a message by hand, send it, and read what the sender actually answered. Use it when a sender is configured and nothing arrives, when you are writing a sender, or when you need to exercise the batch route without waiting for real log traffic.

It exists because **a sender that fails, fails silently**: the core catches the exception, logs it and returns nothing — which is what a correct send of a notification sender returns too. This channel calls the sender directly and shows whatever comes out of it: a result, nothing, or the error in the sender's own words.

> ⚠️ **A send from here is a REAL send.** A mail leaves, a ticket is created, a chat room gets a message. There is no dry run.

**Instance config (`ISenderDebugInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `senderId` | `string` | `''` | Sender preselected when the tab opens. Empty = none; pick one in the tab. |
| `configName` | `string` | `''` | Configuration of that sender preselected when the tab opens. Empty = none. |

**Channel config (`ISenderDebugConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `maxHistory` | `number` | — | How many sends are kept in the tab's history; older ones are dropped. |

The message itself is written in the tab, not in the setup: subject, level, recipients, body, a free JSON metadata object, and a batch count that routes the send through `sendBatch()` instead of `send()`. Everything sent carries `origin.source = 'sender-debug'`, so a destination that keeps the origin can tell these apart from real traffic.

The sender dropdown marks the cases where a send would not prove what it looks like it proves: `not started yet` (usable — the first send starts it), `filter` (chains instead of delivering), `no configs` (configure it first) and `sendBatch` (implements the batch route itself; without the mark a batch is emulated one by one). Sender Debug is cluster-scoped (set **View** to `cluster`); start it from the tab's **⚙️ → Start**.

See the [Sender Debug guide](/0.6.31/guide/extensions/plugins/sender-debug) and [Senders](/0.6.31/guide/extensions/senders/index).
