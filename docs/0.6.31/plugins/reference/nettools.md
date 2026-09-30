# Net Tools

The **Net Tools** plugin is a diagnostic channel: it resolves DNS names and checks TCP ports **from the kwirth process**, which is the only vantage point that answers whether a cluster-internal name resolves and whether a service is reachable from where the workloads are.

It does no networking of its own. Every answer comes from the [`nettools` DCE](/0.6.31/guide/extensions/dces/nettools), declared as `requiresExtension: ["dce:nettools:0.1.0"]` — so the core refuses to install the plugin without it, and refuses to remove it while the plugin is installed.

**Instance config:** none. The channel is cluster-scoped (set **View** to `cluster`) and is started from the tab's **⚙️ → Start**. There is nothing to configure: the form lives in the tab.

**What the tab sends:**

| Field | Type | Default | Description |
|---|---|---|---|
| `target` | `string` | `''` | A host name or an IP address. Validated by the DCE, not by the form |
| `recordType` | `EDnsRecordType` | `A` | `A`, `AAAA`, `CNAME`, `MX`, `NS`, `PTR`, `SOA`, `SRV`, `TXT`. Only for **Resolve** |
| `port` | `number` | `443` | TCP port. Only for **Check port** |
| `count` | `number` | `3` | Attempts. Only for **Check port** |

**What it draws with the DCE's front end:** the channel icon (`Icon`, read through `hasDce()` so a missing DCE leaves the channel in the selector rather than out of it) and the **Latency** dialog (`LatencyDialog`). Every answered DNS lookup is recorded into the DCE's **shared history** with `record()`, from `processChannelMessage` — so an answer that arrives while another tab is on screen is still on the chart. The plugin owns neither the SVG path nor a line of chart code, and does not depend on recharts at all.

**What it answers with:** the DCE's own result, untouched — `IDnsResult`, `IReverseResult` or `IPingResult`. It is not flattened into strings on the back end: every consumer of the DCE gets the same shape, and turning it into text there would hide exactly what is worth looking at.

A failure **inside** the result (a port that refuses, a name that does not resolve) and a **missing DCE** are painted differently, and that is the contract of the type made visible: network failures are data and travel in the result, while `getDce()` throws.

Answers are kept newest first, ten at a time. Opening the tab queries nothing: doing network from the cluster because somebody opened a tab would be the wrong default.

See the [Net Tools guide](/0.6.31/guide/extensions/plugins/nettools) and the [Net Tools DCE](/0.6.31/guide/extensions/dces/nettools) for the contract to consume it from your own extension.
