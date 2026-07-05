# composite (sender)

> **Type:** Sender (pipeline) · **Package:** `@kwirthmagnify/kwirth-sender-composite`

## What it does

The **composite** sender defines a **complete routing pipeline in a single config** — an inline **tree** of **tee**, **regex** and **ref** nodes. Instead of wiring several standalone pipeline senders together, you express the whole flow (fan-out + filtering + references to delivery senders) in one place.

## Configuration

| Field | Type | What it does |
|---|---|---|
| **Name** * | text | Config name (`composite::<name>`). |
| **Flow (JSON)** | json | The pipeline tree. Nodes: **tee** (fan-out), **regex** (filter/route), **ref** (reference an existing `senderId::configName`). |

Add it from **☰ → Manage extensions → Senders → composite → ⚙️ → New**.

## Notes

- Composite is the most powerful sender — think of it as the **whole delivery graph** for a channel in one config: *filter → fan-out → deliver*.
- Prefer separate **[tee](tee)** / **[regex](regex)** / **[timed](timed)** configs for simple cases; reach for `composite` when the flow gets complex enough to want it in one document.

---

← Back to [Senders](index)
