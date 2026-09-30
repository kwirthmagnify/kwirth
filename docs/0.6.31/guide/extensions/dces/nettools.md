# Net Tools DCE

The first **utility** [dynamic core extension](index): DNS resolution and TCP reachability, shared by every extension that needs them, so there is one implementation and one shape of result instead of one per consumer.

| | |
|---|---|
| id | `nettools` |
| package | `@kwirthmagnify/kwirth-dce-nettools` |
| sides | back **and** front |
| source | `dces/nettools` in the kwirth repo |

Each side does a different job, and together they are the clearest worked example of what the type is for:

| side | what it provides |
|---|---|
| **back** | the network itself — `ping()`, `resolve()`, `reverse()`. One implementation, one shape of result |
| **front** | the **icon**, a **latency chart**, and the **shared history** behind it. No consumer owns an SVG path or a line of chart code |

It is consumed by the [Net Tools plugin](/0.6.31/guide/extensions/plugins/nettools), which is also the worked example of how a consumer is written.

## What it provides

```ts
interface INetTools {
    readonly id: string
    ping(target: string, options?: IPingOptions): Promise<IPingResult>
    resolve(name: string, options?: IDnsOptions): Promise<IDnsResult>
    reverse(address: string, options?: IReverseOptions): Promise<IReverseResult>
}
```

### It spawns nothing

No `ping`, no `dig`, no `nslookup` — just `node:net` and `node:dns/promises`.

That is a deliberate constraint, not a limitation nobody got round to fixing. Kwirth runs in a container: the binary may not be in the image, may not have `CAP_NET_RAW` to open a raw socket, and prints a different text on every platform and in every language. Reading that text back was code that worked and solved a problem there was no need to have.

### `ping` is a TCP probe

It connects to a port, times the handshake and closes. **Nothing is written to the port**: the question is whether it answers, and writing to it would be a different question.

Inside a cluster that is also the more useful question. What has to be up is a **service**, not a host — a node that replies to ICMP with its database down tells you nothing.

The time includes resolving the name, which is what a caller trying to reach a service actually waits for.

| Option | Range | Default |
|---|---|---|
| `port` | 1 – 65535 | `443` |
| `count` | 1 – 10 | `4` |
| `timeoutMs` | 100 – 30000 | `2000` |

An option out of range is **clamped, never rejected**: the caller has no better answer than the limit.

### `resolve` and `reverse`

`resolve` takes a record type (`A` by default), optional DNS servers of its own, and a timeout. `reverse` answers the PTR names of an address.

Records come back **as text for every type**, in the canonical order a zone file uses, so one consumer can paint them all:

| Type | What comes back |
|---|---|
| `A`, `AAAA`, `CNAME`, `NS`, `PTR` | the values, as they are |
| `MX` | `10 mail.example.com` — and `0 .` for a NULL MX (RFC 7505) |
| `SRV` | `0 5 5060 sip.example.com` |
| `TXT` | the chunks of each record joined: the 255-byte split is transport, not content |
| `SOA` | its seven fields in order |

An **empty answer is not an error**: the name resolves and has no record of that type, so `records` is empty and `error` is absent.

## The front end

The browser resolves nothing — that is the back end's job, and deliberately: what matters is what **kwirth** sees from inside the cluster. What the front end shares is everything around it.

```ts
interface INetToolsFront {
    readonly id: string
    readonly Icon: FC<SvgIconProps>              // the net tools icon
    readonly LatencyDialog: FC<ILatencyDialogProps>   // the chart, ready to open
    record(sample: TDnsSampleInput): void        // a consumer adds a round trip
    samples(): IDnsSample[]                      // a COPY of the history
    clear(): void
    subscribe(listener: () => void): () => void  // and the function that stops it
}
```

```ts
import { getDce, hasDce } from '@kwirthmagnify/kwirth-common-front'
const nettools = getDce<INetToolsFront>('nettools')
nettools.record({ name: 'example.com', type: EDnsRecordType.A, timeMs: 14, records: 2 })
```

### The history is the point

`record()` and `samples()` read and write **one list for the whole page**. What one plugin records, another sees; open the chart from any of them and it is drawing the same thing. Two bundled copies would each keep their own, and the chart would say something different in every tab **with nothing looking broken** — which is the expensive failure this type of extension exists to prevent.

Three details that are not decoration:

- **`samples()` returns a copy.** A consumer that sorted or spliced it in place would be editing what everybody else reads.
- **The DCE stamps the time**, not the consumer. Two consumers with two clocks would draw a line that jumps backwards.
- **`subscribe()`** is what keeps the chart right while it is open. A shared object that cannot be listened to is a snapshot.

### `hasDce()` where the DCE is optional

The plugin draws the channel icon with `hasDce()` and not `getDce()`, and falls back to its own if it is missing. That code runs while the **channel selector** is being built, and a throw there would leave the channel out of the list with nothing saying why. Everywhere the answer actually matters it uses `getDce()`, which throws with the cause.

### recharts is not bundled

The chart uses recharts, and the core already publishes it in `window.__kwirth__` along with React and MUI — so the DCE's `front.js` maps it instead of bundling it, and weighs about **12 KB**. A DCE that bundled its own would put a second copy of a ~500 KB library on the page, per extension. That is the arithmetic the whole type is built on.

## Nothing throws

This is the part worth reading twice, because it is the opposite of `getDce()`.

| What happened | Where it comes back |
|---|---|
| One attempt failed | `attempts[].error` |
| The whole probe never started (the target was not a host name) | `error`, with `received: 0` and `lossPercent: 100` |
| A name does not resolve | the result's `error`, with an empty `records` |
| The DCE is not installed | `getDce()` **throws** |

A host that does not answer is **data**. A missing DCE is an **installation error**. They are fixed in different places, so they are reported differently — and a consumer never has to wrap a call in a `try`.

## Consuming it

```json
"requiresExtension": ["dce:nettools:0.1.0"]
```

```ts
import { getDce } from '@kwirthmagnify/kwirth-common-back'
import { INetTools } from '@kwirthmagnify/kwirth-dce-nettools/src/common/NetTools'

const nettools = getDce<INetTools>('nettools')
const postgres = await nettools.ping('kwirth-postgres', { port: 5432, count: 3 })
```

⚠️ **Do not bundle the package.** Map it against the registry in your `build.mjs` — `node tools/create-kwirth-plugin.mjs --id my-plugin --dce nettools:0.1.0` leaves that mapping written.

⚠️ And know what the mapping does: it replaces the whole module with the **instance**. Anything the contract exports that is not part of that instance — an **enum** such as `EDnsRecordType` — does not survive it. A consumer that needs one declares it locally and asks the registry only for the object, which is what `plugins/nettools` does.

## What to look for in the log

When kwirth starts, before any other extension:

```
[core] [INFO] [dce:nettools] nettools created: tcp reachability and dns through node, no binary is spawned
[core] [INFO] DCE 'nettools' loaded
```

## Trying it without kwirth

From `dces/nettools` in the repo:

```
npm run try
```

It loads **the very bundle the core loads** with a host in memory and resolves and connects for real. It takes optional arguments — `node try.mjs <target> <name-to-resolve> <ip-to-reverse>`.

It covers the back end only: the front end needs a browser, and it is exercised through the plugin.

## Updating it

A DCE's factory runs **once**, so a new version needs the back end **restarted** — and, because the front-end instance lives in the page, the browser **reloaded**. Whoever already holds an instance keeps it until then.
