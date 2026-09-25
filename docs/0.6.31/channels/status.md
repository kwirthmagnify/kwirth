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
  - **A map of who feeds whom** — the same kind of graph the Iter channel draws, applied to Kwirth's own insides.
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
| **Delivered** | how much it has handed to its consumers since it started, and the rate since your previous snapshot |
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

## The graph

The second button in the toolbar switches from the table to a **map of who feeds whom**.

![statusgraph](../_media/ch-images/status-graph.png ':class=imageclass80')

It reads top to bottom: **producers on top** — providers and pluviders — and **the channels that consume
them underneath**. A line from one to the other means that channel is subscribed to that provider.

**Click a node** and everything it touches stays lit while the rest dims: its own lines thicken and glow,
and so do the components on the other end. Click the background to clear it. On a Kwirth with a handful of
extensions the whole map fits at a glance; on a busy one, that is the only way to answer *"and this one,
who talks to it?"*.

### A line is not traffic

**A line means the subscription exists**, and a still line says nothing more than that. An animated line
reads as *"something is flowing right now"*, so a line only moves when that has actually been measured —
see [Live lines in the graph](#live-lines-in-the-graph). Moving it without a measurement would be the same
lie as printing a `0` where the answer is unknown: it would look like information and it would be decoration.

### The graph only shows

You cannot drag new connections, reconnect lines or delete anything. The topology is decided by the real
subscriptions, not by this drawing, so anything you did here would be a lie the moment you released the
mouse. Moving nodes around and zooming do work — they change nothing and they help you read.

### When somebody is missing

You may see a notice saying that some consumers are **not shown**. It is not a bug and it is worth
understanding:

The graph is built from what **the core intermediated** — every subscription made through Kwirth passes
through one place, and that is where both ends are known. But a provider can also be subscribed to
*directly*, skipping the core; the **Provider Debug** channel does exactly that, on purpose.

So when a provider reports more consumers than the core knows about, the difference is shown as a number
instead of being quietly dropped. Drawing three lines while the provider says there are four would be
lying by omission.

The same applies when the core knows about **none** of them: there is nothing to draw, and the screen says
exactly that — there is consumption, but those subscriptions were made straight to the provider, so nobody
knows who is on the other end. It does *not* report that nothing is subscribed, which would be the opposite
of what is happening. The table still shows how much each producer is delivering.

### What the graph does not include

Only providers, pluviders and the channels consuming them. **Senders and webhooks are not in it**: they are
destinations and entry points, not part of these subscriptions. They are all in the table.

## How much is moving

**Delivered** counts *deliveries*, not events produced: one event handed to four consumers counts four.
That is on purpose — it measures the work the component actually does. A provider that generates a
thousand events and filters them all out has moved nothing.

The number is a total since that component started. Underneath it, once you have taken a second snapshot,
you get a **rate** — deliveries per second between your previous snapshot and this one. That is the number
that tells you whether something is busy *now*: a total of seven million does not distinguish a provider
at full tilt from one that was at full tilt last Tuesday.

If a component restarts its counter goes back to zero; no rate is shown for that interval rather than a
made-up negative one.

### Refreshing

Next to the refresh button there is a selector: **Manual** (the default), or every **5s**, **15s**, **30s**
or **minute**.

The timer only exists while the tab is open — closing it or switching away stops it, with nothing left
running. That is why it starts in Manual: this is a screen to *look at*, and watching continuously is
something you turn on deliberately.

The line under the header always tells you which mode you are in, so the screen never claims to be fresher
than it is.

### Live lines in the graph

In the graph view, **a line moves when its producer's counter changed since the previous refresh**. Put the
selector on 5s and you will see components light up as they deliver and go quiet when they do not.

With an interval set, a live line **slows down and comes to a stop exactly when the next snapshot arrives**.
The movement you saw describes that interval and nothing after it: a line that kept moving would keep
saying *"now"* about data that is already old. If the producer delivered again, the next snapshot sets the
line moving once more; if not, it stays still. In **Manual** there is no interval to run out, so a live line
keeps moving until you take the next snapshot.

Refreshing does not redraw what has not changed: nodes stay exactly where they were, without a flicker, and
only what differs from the previous snapshot is repainted.

What a moving line does **not** tell you is how much went to each consumer. The count belongs to the
component, not to each line: if a provider delivers to three channels, all three lines move, and the split
between them is not measured. When that changes, the lines will be able to speak for themselves.

### The snapshot does not refresh on its own

In Manual mode the time under the header will not change while you watch. That is deliberate: press the
refresh button to take a new one, or pick an interval.

## Cost

**Zero while the tab is closed.** There is no timer, no subscription and no background collection: with the channel closed this plugin does not run a single instruction. When you open it, it reads state that is already in memory and sends one snapshot.

That is a hard requirement, not an optimisation still pending. Kwirth sits in the path of your logs, and a tool that watches it must not slow it down.

## What it is not

  - **Not a monitoring platform.** No history, no time series, no alerts. It shows *now*. Your existing monitoring already covers CPU and memory of the pod, with more history and better alerting than this could offer.
  - **Not a debugger.** It never shows what a provider emits. To inspect the actual events, use the **Provider Debug** channel, which is built for whoever *writes* a provider — this one is for whoever *operates* a Kwirth.

## Permissions

The inventory is a privileged view: it lists every extension mounted in the server. Its scope level is **cluster**, so it is not available to users restricted to a namespace.

## Coming next

  - **Per-component counters** — events and bytes moved by each provider, channel and sender, counted only while you are watching.
