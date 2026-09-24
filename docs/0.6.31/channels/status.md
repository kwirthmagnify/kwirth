# Status
Status channel shows you **what this Kwirth has inside**: every provider, pluvider, sender and webhook it has mounted, what state each one is in, and — the part that matters — **why** it is in that state.

Kwirth knows a great deal about your cluster and almost nothing about itself. When an extension does not work, the symptom you see rarely looks like the cause: a provider nobody consumes is simply absent, an extension waiting for a restart answers `404` on its own routes, and a sender with no configuration looks installed and healthy. This channel puts that state on a screen.

![statusinventory](../_media/ch-images/status-inventory.png ':class=imageclass80')

## What for
With Status channel you can:

  - Answer *"is everything up?"* without reading the core log line by line.
  - Find out **why** something is not running, instead of only that it is not.
  - See at a glance which extensions are installed but idle, and which are waiting for a server restart.
  - Check, before you go hunting elsewhere, whether the problem is Kwirth or the thing you are pointing it at.

## Features
Key features of Status channel:

  - **Real state, not just installed/not installed** — each component is classified and the reason is spelled out in plain words.
  - **Sorted by what needs attention** — problems first, healthy components last. You never scroll to find the bad news.
  - **Filter by name or kind** — type `sender` and only senders remain.
  - **Zero cost when closed** — no timer, no polling, no background collection. See [Cost](#cost).
  - **No payloads, ever** — it never shows the content of your logs or messages.

## Use
Select the cluster in the resource selector, add a **status** tab and start it. There is nothing to configure.

The table has five columns:

| Column | What it tells you |
|---|---|
| **Kind** | Provider, Pluvider, Sender or Webhook |
| **Name** | the component id, as the rest of Kwirth names it |
| **State** | see the table below |
| **Consumers** | how many things are consuming it — or **—** when the component does not say |
| **Why** | the reason, when there is one worth giving |

### States

| State | What it means | What to do |
|---|---|---|
| **Active** | running, and something is consuming it | nothing |
| **Idle** | running, but **nothing is consuming it** | decide whether you still need it installed |
| **Running** | running, and it does not report how many consumers it has | nothing — see below |
| **Not started** | installed, but the core never started it | the **Why** column says what is missing — usually that no installed channel declares that provider, so nothing ever asked for it |
| **Needs restart** | running, but something of it is not wired in | restart the Kwirth server; its routes are only mounted at startup |
| **Failed** | it tried to start and failed | the **Why** column carries the error |
| **Not reported** | the component does not publish that information | nothing is wrong — it is the honest answer when the data does not exist |

> **Why "Not reported" is not an error.** Extensions publish what they know about themselves, and not all of
> them do. An extension that stays quiet is shown as *not reported* rather than as a zero, because a zero
> would be a statement — and one nobody can back up.

### A dash is not a zero

In the **Consumers** column you will see numbers on some rows and a dash on others. They mean different
things, and the difference matters:

| | |
|---|---|
| **4** | four things are consuming it right now |
| **0** | nothing is consuming it — that row also shows as **Idle** |
| **—** | the component **does not say**. Nothing is wrong with it |

Reporting consumers is optional, so a component that does not implement it shows a dash. Senders and
webhooks always show a dash: the mechanism belongs to providers. A provider written before this existed, or
one that comes from elsewhere, shows one too — and it keeps working exactly the same.

**This is on purpose.** Showing a `0` where the answer is unknown would read as *"nothing uses this"*, and
whoever read it might uninstall something that is very much in use. A dash cannot be misread.

### Idle is information, not a fault

An **Idle** provider is running correctly; it just has nobody listening. That is why its chip is grey and
not orange: it is not something to fix, it is something to decide about. It may be a provider you installed
and never wired to a channel, or one whose consumer you removed and forgot to clean up.

### The snapshot does not refresh on its own

Under the header you will see the time the snapshot was taken, and it will not change while you watch. That is deliberate: press the refresh button to take a new one.

## Cost

**Zero while the tab is closed.** There is no timer, no subscription and no background collection: with the channel closed this plugin does not run a single instruction. When you open it, it reads state that is already in memory and sends one snapshot.

That is a hard requirement, not an optimisation still pending. Kwirth sits in the path of your logs, and a tool that watches it must not slow it down.

## What it is not

  - **Not a monitoring platform.** No history, no time series, no alerts. It shows *now*. Your existing monitoring already covers CPU and memory of the pod, with more history and better alerting than this could offer.
  - **Not a debugger.** It never shows what a provider emits. To inspect the actual events, use the **Provider Debug** channel, which is built for whoever *writes* a provider — this one is for whoever *operates* a Kwirth.

## Permissions

The inventory is a privileged view: it lists every extension mounted in the server. Its scope level is **cluster**, so it is not available to users restricted to a namespace.

## Coming next

  - **The dependency diagram** — the same kind of graph the Iter channel draws, applied to Kwirth's own insides.
  - **Per-component counters** — events and bytes moved by each provider, channel and sender, counted only while you are watching.
