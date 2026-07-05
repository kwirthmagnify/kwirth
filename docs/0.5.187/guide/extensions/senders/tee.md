# tee (sender)

> **Type:** Sender (pipeline) · **Package:** `@kwirthmagnify/kwirth-sender-tee`

## What it does

The **tee** sender is a **pipeline node**: it **fans an incoming message out to several downstream senders at once** (like Unix `tee`). It doesn't deliver anywhere itself — it forwards to the targets you list. Use it to, say, email **and** post to Teams **and** write a file from a single reference.

## Configuration

| Field | Type | What it does |
|---|---|---|
| **Name** * | text | Config name (`tee::<name>`). |
| **Targets (JSON)** | json | The list of downstream targets — each a `senderId` + `configName` the message is copied to. |

Add it from **☰ → Manage extensions → Senders → tee → ⚙️ → New**.

## Notes

- A channel points at **one** sender config; make that a `tee` config to reach many destinations at once.
- Targets can themselves be pipeline senders (e.g. a `ratelimit` in front of an `email-smtp`), letting you build real delivery graphs — or use **[composite](composite)** to express the whole tree in one config.

---

← Back to [Senders](index)
