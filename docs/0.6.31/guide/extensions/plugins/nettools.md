# 🧩 Net Tools (plugin)

> **Type:** Plugin (channel)<br>
> **Package:** `@kwirthmagnify/kwirth-plugin-nettools`<br>
> **Requires:** the [Net Tools DCE](/0.6.31/guide/extensions/dces/nettools) (`dce:nettools:0.1.0`)

## Overview

**Net Tools** resolves DNS names and checks TCP ports **from where kwirth runs**. Open a tab, type a host name, and ask one of three questions.

It does no work of its own: the answers come from the [`nettools` DCE](/0.6.31/guide/extensions/dces/nettools), which every other extension shares.

## Why it exists

Because *«it resolves fine from my machine»* answers the wrong question.

- `kwirth-postgres.default.svc.cluster.local` means nothing outside the cluster and everything inside it.
- The DNS servers that matter are the cluster's, not your laptop's.
- A port that answers from your desk may not answer from where the workload actually is.

Without this, finding that out means `kubectl exec` into some pod that happens to have a shell, and hoping it also has `nslookup`.

## When to use it

- **A workload cannot reach a service** — check whether the name resolves, and to what, before blaming the application.
- **You just configured an extension with a host in it** — a provider, a sender, a database — and want to know the address is reachable at all.
- **A `Service` was renamed or moved namespace** — see what the cluster's DNS answers now.
- **You want the MX or TXT of a public domain** as kwirth's own resolvers see it.

## Getting started

1. Choose **Cluster**, set **View** to `cluster`, pick the **nettools** channel and click **ADD**.
2. Open the tab's **⚙️ → Start**. There is nothing to configure.
3. Type a host name or an IP in **Host or IP**, and press one of the three buttons.

## The three questions

| Button | What it asks | Uses |
|---|---|---|
| **Resolve** | the records of a name, of the type picked in **Record** | `nettools.resolve()` |
| **Reverse** | the PTR names of an IP address | `nettools.reverse()` |
| **Check port** | whether the TCP **Port** answers, three times | `nettools.ping()` |

The **Record** dropdown covers `A`, `AAAA`, `CNAME`, `MX`, `NS`, `PTR`, `SOA`, `SRV` and `TXT`. Records are shown as text whatever the type, in the order a zone file writes them: an `MX` reads `10 mail.example.com`, an `SRV` reads `0 5 5060 sip.example.com`.

**Check port** does not write anything to the port. It connects, times the handshake and closes — and the time includes resolving the name, which is what something trying to reach that service actually waits for.

## Reading the answers

Answers stack up **newest first**, ten at a time. Each one carries what was asked and of what (`resolve A · example.com`, `check · 10.43.12.9:5432`), a one-line verdict, and the lines themselves in a monospaced font.

The verdict for a port check reads `3/3 answered · 0% loss · min/avg/max`, plus the address it connected to.

### Grey and red are not the same thing

| What you see | What it means |
|---|---|
| Lines in grey, with `ECONNREFUSED` or `timed out` | The port refused or did not answer. **This is a reading**, and it is the answer to your question |
| *No records of this type* | The name resolves and simply has none. Not a failure |
| Red, `Invalid name '…': a host name was expected` | What you typed is not a host name — a URL, or something with a space in it |
| Red, `DCE 'nettools' is not loaded…` | The DCE is missing or its factory failed. **This** is the broken one |

The distinction is the point: everything the network tells you is data, and red is kept for the one thing that is really wrong.

## Installing

Install the **DCE first**, from **☰ → Manage extensions → DCEs**, then the plugin from **☰ → Manage extensions → Plugins**. Kwirth enforces the order: the plugin will not install without the DCE, and the DCE will not be removed while the plugin is installed.

Updating the DCE needs the **core restarted** — its factory runs once, at load.

## Related

- [Net Tools DCE](/0.6.31/guide/extensions/dces/nettools) — where the work actually happens, and the contract to consume it from your own extension.
- [Dynamic core extensions](/0.6.31/guide/extensions/dces/index) — what a DCE is and why a plugin declares one.
