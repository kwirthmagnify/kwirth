# file (sender)

> **Type:** Sender<br>
> **Package:** `@kwirthmagnify/kwirth-sender-file`

## What it does

The **file** sender appends each message to a **file** on the kwirth server, with optional rotation by line count. Use it to keep a durable local record of alerts/output.

It also accepts **batches**, so it doubles as the simplest destination for **log forwarding**: a plugin like montag hands over a hundred lines at once and they are written in a single append, instead of one system call per line.

## Configuration

![File sender configuration](../../../_media/guide/sender-file.png)

| Field | Type | What it does |
|---|---|---|
| **Name** * | text | Config name (`file::<name>`). |
| **Description** | text | Free-text note. |
| **File path** * | text | Absolute path of the file to append to (inside the kwirth backend). |
| **Timestamps** | toggle | Prefix each line with a timestamp. **On** by default. |
| **Levels** | toggle | Include the message level. **On** by default — worth turning off for forwarded log, where every line would read `[INFO]`. |
| **Max lines** | number | Cap the file size; older lines are rotated out beyond this. |
| **Prefix each line with its origin** | toggle | Write where the line came from: `[namespace/pod/container]`, or the service name when it did not come from a pod. Off by default. |

## Notes

- The path is **on the kwirth backend** — mount a volume there if you want the file to survive pod restarts.
- Combine with **[tee](tee)** to write to a file **and** notify elsewhere at the same time.

### Forwarding log into a file

Turn **Prefix each line with its origin** on and **Levels** off, and point a log forwarder at this config.
A file of lines coming from twenty pods is unreadable without knowing which pod wrote each one, and the
level tag adds nothing when every line carries the same one.

Each line keeps **its own time**, not the time it was written: with batches, a hundred lines arrive at
once, and stamping them all with the moment of the write would collapse them into the same instant —
losing exactly what makes a log useful. If the producer does not state a time, the time of writing is
used.

Rotation counts the **whole batch**, so `Max lines` holds even when a single append writes a hundred
lines at a time.

---

← Back to [Senders](index)
