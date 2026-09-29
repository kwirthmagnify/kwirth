# Net Tools

A **dynamic core extension** (DCE) for [Kwirth](https://kwirthmagnify.dev): network primitives shared by Kwirth extensions — TCP reachability and DNS resolution, forward and reverse.

A DCE brings **objects**, not data and not screens: Kwirth calls its factory **once**, keeps what it returns, and any other extension can ask for it by id. This one is **back only**: there is nothing to paint, and whoever consumes it paints its results. The [Net Tools plugin](https://www.npmjs.com/package/@kwirthmagnify/kwirth-plugin-nettools) does exactly that, and is the worked example of how a consumer is written.

**It spawns nothing.** Everything runs on Node alone — a socket and a resolver. Kwirth runs in a container: a `ping` binary may not be there, may not have the permission for a raw socket, and prints something different on every platform and in every language.

## What it gives you

```ts
interface INetTools {
    readonly id: string
    ping(target: string, options?: IPingOptions): Promise<IPingResult>
    resolve(name: string, options?: IDnsOptions): Promise<IDnsResult>
    reverse(address: string, options?: IReverseOptions): Promise<IReverseResult>
}
```

**Nothing throws.** A host that does not answer is a reading, not an exception: what failed for one attempt is in `attempts[].error`, and what failed for the whole probe is in `error`, with the rest of the object left coherent (`received: 0`, `lossPercent: 100`). Options out of range are clamped, not rejected.

### ping

A **TCP** reachability probe: it connects to a port, times the handshake and closes. Nothing is written to the port — the question is whether it answers. Inside a cluster that is also the more useful question: it is a *service* that has to be up, not a host.

```ts
const postgres = await nettools.ping('kwirth-postgres', { port: 5432, count: 3 })
// { target: 'kwirth-postgres', port: 5432, address: '10.43.12.9',
//   sent: 3, received: 3, lossPercent: 0, minMs: 1, avgMs: 1.3, maxMs: 2, attempts: [...] }
```

Options: `port` (1–65535, default 443), `count` (1–10, default 4), `timeoutMs` (100–30000, default 2000).

### resolve and reverse

```ts
const a   = await nettools.resolve('example.com')                                   // A, system resolvers
const mx  = await nettools.resolve('example.com', { type: EDnsRecordType.MX })      // ['0 .'] — a null MX
const txt = await nettools.resolve('example.com', { servers: ['1.1.1.1'], timeoutMs: 500 })
const ptr = await nettools.reverse('8.8.8.8')                                       // { hostnames: ['dns.google'] }
```

Records come back **as text for every type**, in the canonical order a zone file uses, so one consumer can paint them all: `MX` is `"10 mail.example.com"`, `SRV` is `"0 5 5060 sip.example.com"`, a chunked `TXT` comes back joined, `SOA` is its seven fields, and a NULL MX (RFC 7505) is `"0 ."`.

An **empty answer is not an error**: the name resolves and has no record of that type, so `records` is empty and `error` is absent.

## Consuming it

Declare the dependency in the consumer's `package.json`, with the minimum version:

```json
"requiresExtension": ["dce:nettools:0.1.0"]
```

Kwirth then refuses to install the consumer without this DCE, and refuses to remove this DCE while the consumer is installed.

In the back end:

```ts
import { getDce } from '@kwirthmagnify/kwirth-common-back'
import { INetTools } from '@kwirthmagnify/kwirth-dce-nettools/src/common/NetTools'

const nettools = getDce<INetTools>('nettools')   // throws if it is not loaded, and says why
```

`getDce()` throwing is deliberate, and it is the opposite of everything else here: a missing DCE is an installation error, while a host that does not answer is data.

⚠️ **Do not bundle the DCE's package.** Map it to the registry in the consumer's `build.mjs` (`node tools/create-kwirth-plugin.mjs --dce nettools` leaves that mapping written). A bundled copy builds its own object, and the one instance the type guarantees quietly becomes two.

⚠️ The mapping replaces the whole module with the **instance**, so anything the contract exports that is not part of it — an **enum** such as `EDnsRecordType` — does not survive it. A consumer that needs one declares it locally, as `plugins/nettools` does, and asks the registry only for the object.

## Building

```
npm install
npm run build      # typecheck + dist
npm run watch      # rebuild on every save
npm test
npm run try        # runs dist/back.js against the real network, outside Kwirth
```

`npm run try` is how a back-only DCE is checked by hand: it loads **the very bundle the core loads**, with a host in memory, and resolves and connects for real. It takes optional arguments — `node try.mjs <target> <name> <ip>`.

Install it from **☰ → Manage extensions → DCE** in Kwirth. Updating a DCE needs the Kwirth back end **restarted**: the core calls a factory once, at load.

Part of [Kwirth](https://github.com/kwirthmagnify/kwirth).
