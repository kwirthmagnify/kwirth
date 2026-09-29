# 🧩 Sender Debug (plugin)

> **Type:** Plugin (channel)<br>
> **Package:** `@kwirthmagnify/kwirth-plugin-sender-debug`<br>
> **Icon:** 🧩

## Overview

**Sender Debug** is the outbound twin of [Provider Debug](provider-debug): that one shows you, raw, what comes *in* through a provider; this one shows you what happens when something goes *out* through a sender.

You pick a sender, pick one of its configurations, write a message by hand, send it, and read what the sender actually answered.

> ⚠️ **A send from here is a REAL send.** A mail leaves, a ticket is created, a chat room gets a message. There is no dry run, because a dry run would not prove anything.

## Why it exists

**A sender that fails, fails silently.** When a send throws, the core catches the exception, writes it to its own log and returns nothing — which is exactly what a correct send of a notification sender returns too. For whoever called it, a broken sender and a working one are indistinguishable.

Without this channel, checking that a sender works means provoking the real condition that triggers it — an alert, a crash, a rule — and then digging through the core's log to find out why nothing arrived.

This channel calls the sender directly and catches whatever comes out of it: a result, nothing, or an exception. And it puts it on the screen.

## When to use it

- **You configured a sender and nothing arrives** — find out whether it throws, and read the error in its own words.
- **You wrote a sender** — see what your `send()` returns before any real traffic depends on it.
- **You need to exercise `sendBatch()`** — the batch route is the one log destinations use (Datadog, Elastic, Loki take arrays and charge per request), and otherwise it is only reached when there is real log traffic.
- **You are about to trust a destination** — confirm a ticket really gets created, and read the key and URL it came back with.

## Getting started

1. Choose **Cluster**, set **View** to `cluster`, pick the **sender-debug** channel and click **ADD**.
2. Open the tab's **⚙️ → Start**. The setup only asks for the history size — everything else lives in the tab itself.
3. Pick a **Sender** and one of its **Configurations**, write the message and press **SEND**.

## The message

| Field | Meaning |
|---|---|
| `Subject` | Optional. Senders that have no notion of a subject ignore it |
| `Level` | `debug`, `info`, `warning` or `error`. Some senders colour or route by it |
| `To` | Comma separated. What a recipient *means* is up to the sender: a mailbox, a room, a project |
| `Body` | The only required field |
| `Metadata` | Free JSON object. Validated before the send is allowed |
| `Batch` | Deliver N copies through `sendBatch()` instead of one through `send()` |

Everything sent from here carries `origin.source = 'sender-debug'`, so a destination that keeps the origin can tell these apart from real traffic.

## What the sender list tells you

The dropdown does not just list senders — it warns you about the ones where a send would not prove what it looks like it proves.

| Mark | Meaning |
|---|---|
| `not started yet` | The core has not instantiated it. **It can still be used**: the first send starts it, exactly as any plugin sending to it would |
| `filter` | The extension declares `senderType: 'filter'` (regex, ratelimit, timed). A filter does **not** deliver anywhere, it chains — so sending to it proves nothing about delivery |
| `no configs` | Installed, but with no configuration. Give it one in the sender manager first |
| `sendBatch` | It implements the batch route itself. Without this mark a batch is delivered one by one, and the answer says `emulated` — because that is not the same thing |

## Reading the history

A row appears **the moment the send leaves**, not when the sender replies: it shows a clock and `sending…`, and turns into its verdict when the answer arrives. With a slow destination, that is the difference between seeing something and seeing nothing.

Every row opens, and shows the two halves of the exchange:

- **Sent** — the message exactly as it left, including the `origin.source` this channel stamps on everything. Knowing what the destination answered is worth little if you have to reconstruct from memory what you sent it.
- **Answered** — what the sender returned, what it threw, or the plain statement that it returned nothing.

| Verdict | What it means |
|---|---|
| `delivered` | The sender returned without throwing. Most notification senders return nothing, and that is a success |
| `delivered, with a result` | It returned a result — a ticketing sender returns the key and URL of the ticket it just created. Open the row to read it |
| ✗ with a message | It threw, and the text is the sender's own. **This is the case that used to be lost in the core's log** |
| `no answer — the channel was stopped` | The channel was stopped while the send was still in flight. Nothing is invented: whether it arrived is simply not known |

## Related

- [Provider Debug](provider-debug) — the inbound twin: what a provider emits, raw.
- [Senders](/0.6.31/guide/extensions/senders/index) — what a sender is and which ones ship with kwirth.
