# Syslog Provider

Turns Kwirth into a **syslog receiver**. It listens on a UDP and/or TCP port, parses
**RFC 5424** and **RFC 3164** messages, hands each one to every subscribed channel, and can
**relay** the untouched bytes onward to other collectors.

It is the provider for anything that can only speak syslog: network gear, appliances, firewalls,
legacy applications — things that will never grow a Kubernetes-aware agent.

```
appliances ──udp/tcp──▶ syslog provider ──▶ subscribers (channels)
                              └──────────▶ relay targets (unchanged bytes)
```

## Restart the core after installing it

This provider **declares `requiresRestart`** (since `0.1.27`) and Kwirth prompts you accordingly.
**Take the prompt seriously**, because this provider's failure mode is the quiet one.

Its listener is opened by `startProvider()`, which runs when the core instantiates the provider —
and the core only does that **while it starts up**. Installing registers the provider; it does not
open a socket in a process that is already running. So until you restart, **the port is not
listening and nothing tells you so**: no error in the UI, no traffic, no log line. Just silence.

The order that works:

1. Install the provider.
2. **Configure it** (see below) — it will not start without configuration.
3. Restart the core.

Step 2 is not optional either: `startProvider()` throws if there is no configuration, so a restart
with an unconfigured provider leaves you exactly where you were.

## What a subscriber receives

One `ISyslogMessage` per message, parsed. No filtering of any kind: **every subscriber gets every
message** — `addSubscriber` ignores its subscription data.

```ts
interface ISyslogMessage {
    raw: string                  // the message exactly as it arrived
    sourceIp?: string            // set for UDP and TCP; absent only if the socket had no address
    facility: number             // 0-23
    facilityName: TSyslogFacility    // 'kern' | 'user' | ... | 'local7'
    severity: number             // 0-7
    severityName: TSyslogSeverity    // 'emerg' | 'alert' | 'crit' | 'err' | 'warning' | 'notice' | 'info' | 'debug'
    timestamp: Date
    hostname: string
    appName: string
    procId?: string              // RFC 5424, or the [pid] of an RFC 3164 tag
    msgId?: string               // RFC 5424 only
    structuredData?: Record<string, Record<string, string>>   // RFC 5424 only
    message: string              // the payload without the header
    rfc: '3164' | '5424'
}
```

### How the RFC is decided

Per message, in this order:

1. **RFC 5424** if the header matches *and* the version field is numeric. That last check is what
   stops `<13>Oct  7 …` from being read as version `Oct`: in 3164 that position holds a month name.
2. **RFC 3164** if `<PRI>Mmm DD HH:MM:SS HOSTNAME TAG[PID]:` matches.
3. **Neither** — the message is still delivered, not dropped: `raw` and `message` hold the whole
   line, `facility`/`severity` come from the priority if there was one, `timestamp` is *now*,
   `hostname` and `appName` are `-`, and `rfc` reads `'3164'`.

That third case is worth knowing when a device's output looks odd: you will see the message, with a
receive-time timestamp rather than the sender's.

## Configuration

Edited from the provider's own dialog (**☰ → Manage extensions → Providers → Syslog → ⚙**) and
stored by the core, which hands it to the provider through `configure()`.

| Field | Default | What it does |
|---|---|---|
| `port` | `513` | The port to listen on. **See the note below — you almost certainly want `514`.** |
| `protocol` | `both` | `udp`, `tcp` or `both`. With `both`, the same port number is bound on each. |
| `tcpFraming` | `non-transparent` | **Currently has no effect.** See *Known quirks*. |
| `relayTargets` | `[]` | Collectors to forward the raw bytes to: `{ host, port, protocol: 'udp' \| 'tcp' }`. |
| `maxMessages` | `10000` | Bound on the in-memory queue. Beyond it, messages are **discarded**. |
| `maxParallel` | `20` | Messages dispatched concurrently to subscribers and relays. |

### Backpressure

Incoming messages go into a bounded queue drained by at most `maxParallel` workers. When the queue
is full **the new message is dropped** — not the oldest — and a line is logged **every thousand
discards**:

```
[syslog] 5000 messages discarded (queue full, maxMessages=10000)
```

So a burst that outruns the subscribers loses the burst, not the history. If you see that line,
either the subscribers are slow or `maxMessages` is too small for your peaks.

### Relaying

Each received datagram or frame is forwarded to every relay target **byte for byte** — the original
buffer is carried through the queue alongside the parsed message, so what a downstream collector
receives is what the device sent, not a re-serialisation.

⚠️ **Relaying happens on the way out of the queue, not on the way in.** A message discarded because
the queue was full is therefore **not relayed either**: overflow costs you the copy at the secondary
collector too, which is exactly when you would want it. Size `maxMessages` for your peaks if you are
relaying to something you consider the system of record.

- **UDP** targets share one socket, created on first use.
- **TCP** targets get **one connection per message**, framed with octet-counting (`<length> ` then
  the bytes) and closed immediately.

Relay errors are swallowed on purpose: an unreachable secondary collector must not take down
ingestion. The flip side is that **a broken relay target is silent** — verify it at the far end.

## Known quirks

Both of these are in the code as written, documented here rather than papered over:

- **`tcpFraming` is ignored.** `TcpServer` receives it and never reads it: framing is
  **auto-detected per connection** from the first byte — a digit means octet-counting
  (RFC 6587 §3.4.1), anything else means newline-delimited (§3.4.2). In practice the detection is
  what you want, but the setting in the dialog does nothing.
- **The default port is `513`, not `514`.** Standard syslog is `514`; `513` is `who`/`rlogin`
  territory. Unless you deliberately want 513, set the port explicitly.

## Deployment notes

- **Both `513` and `514` are privileged ports.** Binding below 1024 needs the capability
  (`NET_BIND_SERVICE`) or root in the Kwirth container. Without it, `startProvider()` logs
  `UDP/TCP server failed to start on port …` and carries on with the other protocol — check the log
  if nothing arrives.
- **The port is network-facing.** Expose it deliberately: syslog over UDP is unauthenticated and
  trivially spoofable, so treat what arrives as untrusted input and restrict who can reach the port.
- **UDP drops under load** and gives you no way to know. TCP does not, but needs framing the sender
  and receiver agree on — see above.
- **Nothing is persisted.** The provider holds a queue, not a store: messages that arrive with no
  subscriber attached are relayed and then gone.

## Development

```bash
npm install
npm run build      # dist/back.js + dist/front.js + dist/package.json
npm run watch      # rebuild on save, no typecheck (that is what build is for)
```

There is **no test suite yet** — the parser (`SyslogParser`), the TCP framing state machine
(`TcpServer`) and the queue are all straightforward to cover with fixtures, and are the obvious
place to start.

Load it in development by adding it to `back/kwirth-dev.json` under `providers` and restarting the
core:

```json
"syslog": "../providers/syslog/dist"
```

User documentation lives in the core guide, at
`docs/<version>/guide/extensions/providers/syslog.md`.
