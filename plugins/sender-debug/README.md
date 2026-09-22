# Sender Debug

Kwirth channel plugin for **probing a sender by hand**. Pick a sender, pick one of its
configurations, write a message, send it, and see what the sender actually answered.

It is the outbound twin of [Provider Debug](../provider-debug/README.md): that one shows you, raw,
what comes *in* through a provider; this one shows you what happens when something goes *out*
through a sender.

> ⚠️ **A send from here is a REAL send.** A mail leaves, a ticket is created, a chat room gets a
> message. There is no dry run, because a dry run would not prove anything.

## Why it exists

A sender that fails, fails **silently**. `SenderManager.send()` catches the exception, writes a
`logError` in the core and returns `undefined` — which is exactly what a correct send of a
notification sender returns too. For whoever called it, a broken sender and a working one are
indistinguishable.

So today, checking that a sender works means provoking the real condition that triggers it (an
alert, a crash, a rule) and then going to the core logs to find out why nothing arrived.

This channel calls the sender directly and catches whatever comes out of it — a result, nothing, or
an exception — and puts it on the screen.

And it is the only way to exercise `sendBatch()` by hand: the batch route, the one log destinations
use (Datadog, Elastic, Loki, whose APIs take arrays and charge per request), is otherwise only
reached when there is real log traffic.

## Usage

1. Open a **Sender Debug** tab and start the channel (tab settings ⚙ → Start). The setup only asks
   for the history size: everything else lives in the tab.
2. Pick a **Sender** and one of its **Configurations**.
3. Write the message and press **SEND**.
4. The result lands in the history: delivered (with whatever the sender returned, if anything) or
   failed, with the error text.

### The message

| Field | Meaning |
|---|---|
| `Subject` | Optional. Senders that have no notion of a subject ignore it |
| `Level` | `debug`, `info`, `warning` or `error`. Some senders colour or route by it |
| `To` | Comma separated. What a recipient *means* is up to the sender: a mailbox, a room, a project |
| `Body` | The only required field |
| `Metadata` | Free JSON object. Validated before the send is allowed |
| `Batch` | Deliver N copies through `sendBatch()` instead of one through `send()` |

Everything sent from here carries `origin.source = 'sender-debug'`, so a destination that keeps the
origin can tell these apart from real traffic.

### What the sender list tells you

| Mark | Meaning |
|---|---|
| `not started yet` | The core has not instantiated it. **It can still be used**: `getSender()` is lazy, so the first send starts it — exactly as any plugin sending to it would |
| `filter` | The extension declares `senderType: 'filter'` (regex, ratelimit, timed). A filter does **not** deliver anywhere, it chains — sending to it does not prove what it looks like it proves |
| `no configs` | Installed, but with no configuration. Give it one in the sender manager first |
| `sendBatch` | It implements the batch route itself. Without this mark a batch is delivered one by one — the answer says `emulated`, because that is not the same thing |

### Reading the history

A row appears **the moment the send leaves**, not when the sender replies: it shows a clock and
`sending…`, and turns into its verdict when the answer arrives. With a slow destination that is the
difference between seeing something and seeing nothing.

Every row opens, and shows the two halves of the exchange:

- **Sent** — the `ISenderMessage` exactly as it left, including the `origin.source = 'sender-debug'`
  this channel stamps on everything. Knowing what the destination answered is worth little if you
  have to reconstruct from memory what you sent it.
- **Answered** — what the sender returned, what it threw, or the plain statement that it returned
  nothing.

| Verdict | What it means |
|---|---|
| `delivered` | The sender returned without throwing. Most notification senders return nothing, and that is a success |
| `delivered, with a result` | It returned an `ISenderResult` — a ticketing sender returns the key and URL of the ticket it just created. Open the row to read it |
| ✗ with a message | It threw, and the text is the sender's own. **This is the case that used to be lost in a core log** |
| `no answer — the channel was stopped` | The channel was stopped while the send was still in flight. Nothing is invented: whether it arrived is simply not known |

## Development

```
npm install          # once
npm run watch        # rebuilds dist/ on every save (no typecheck: saving stays instant)
npm run build        # typecheck + build + dist/package.json
npm test             # 42 unit tests
```

The e2e suite lives in [e2e/](e2e/) and needs the app running (`e2e/.creds.json`, gitignored):

```
cd e2e
npm install
node node_modules/@playwright/test/cli.js test
```

> ⛔ The e2e suite never sends through anything that reaches the network. The only sender it touches
> is `console`, which writes to the core log. An e2e that fires a sender sends real notifications to
> real people.

Register it in `back/kwirth-dev.json` under `plugins` to have the core load it from `dist/`. The
core reads that file **at startup only**, so a brand new plugin needs a back restart.
