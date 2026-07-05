# ratelimit (sender)

> **Type:** Sender (pipeline) · **Package:** `@kwirthmagnify/kwirth-sender-ratelimit`

## What it does

The **ratelimit** sender is a **pipeline throttle**: it caps how many messages pass through in a given **interval**, protecting a downstream destination from being flooded (e.g. an alert storm hammering Teams or email). Messages **over** the limit aren't lost — they're **queued and delivered in the next time window**.

## Configuration

| Field | Type | What it does |
|---|---|---|
| **Name** * | text | Config name (`ratelimit::<name>`). |
| **Interval** | number | The time window (seconds) over which the limit applies. |
| *(downstream)* | — | The sender(s) messages are forwarded to when under the limit. |

Add it from **☰ → Manage extensions → Senders → ratelimit → ⚙️ → New**. *(This sender may not be installed by default — add it from the Install field if it's missing.)*

## Notes

- Place a `ratelimit` **in front of** a delivery sender (via **[tee](tee)** / **[composite](composite)**) so bursts are smoothed before they reach the destination.
- Overflow is **queued**, not dropped — it's delivered in the following window, so nothing is lost, just paced.

---

← Back to [Senders](index)
