# Net Tools — channel plugin for Kwirth

Resolve DNS names and check TCP ports **from where Kwirth runs**, without entering a pod.

It is a channel for [Kwirth](https://kwirthmagnify.dev): open a tab, type a host name, and ask.

## Why it is not the same as doing it from your laptop

Everything is answered by the **Kwirth process**, not by your browser. That is the whole point:

- `kwirth-postgres.default.svc.cluster.local` means nothing outside the cluster, and everything inside it.
- The DNS servers that matter are the cluster's, not your machine's.
- A port that answers from your desk may not answer from where the workload actually is.

## What it does

| button | what it answers |
|---|---|
| **Resolve** | the records of a name — `A`, `AAAA`, `CNAME`, `MX`, `NS`, `PTR`, `SOA`, `SRV`, `TXT` |
| **Reverse** | the PTR names of an IP address |
| **Check port** | whether a TCP port answers, three times, with the times and the packet loss |

Answers stack up newest first, each one saying what was asked and of what.

A **port that refuses** and a **name that does not resolve** are shown as readings, not as errors — because that is what they are. The plugin keeps red for the one thing that really is broken: its dependency missing.

## Requirements

It needs the [`nettools` DCE](https://www.npmjs.com/package/@kwirthmagnify/kwirth-dce-nettools), which is where the actual work happens:

```json
"requiresExtension": ["dce:nettools:0.1.0"]
```

Kwirth enforces it: this plugin will not install without the DCE, and the DCE will not be removed while this is installed. Install the DCE from **☰ → Manage extensions → DCEs** first, then this from **☰ → Manage extensions → Plugins**.

The DCE spawns no processes: no `ping`, no `dig`, no `nslookup`. Just a socket and a resolver, so it works the same in any container, with or without `CAP_NET_RAW`.

## Building from source

```
npm install
npm run build
npm run watch
```

A change in `front.js` is picked up by reloading the page. A change in `back.js` needs the **core restarted**: it caches the module.

⚠️ The DCE's contract is declared locally in `src/common/NetToolsContract.ts` rather than imported from its package, and that is deliberate: mapping the package against the registry replaces the whole module with the **instance**, so the enum `EDnsRecordType` — which this plugin needs to build its dropdown — would not survive the mapping. Types and enums are copied; the instance is asked for with `getDce()`. Keep the file in step with the DCE.

Part of [Kwirth](https://github.com/kwirthmagnify/kwirth).
