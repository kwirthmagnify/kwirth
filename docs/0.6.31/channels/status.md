# Status
Status channel shows you **what this Kwirth has inside**: every provider, pluvider, sender and webhook it has mounted, what state each one is in, and — the part that matters — **why** it is in that state. And around that: who consumes whom, how much the Kwirth process is using, every HTTP route it has published, and its own log.

Kwirth knows a great deal about your cluster and almost nothing about itself. When an extension does not work, the symptom you see rarely looks like the cause: a provider nobody consumes is simply absent, an extension waiting for a restart answers `404` on its own routes, and a sender with no configuration looks installed and healthy. This channel puts that state on a screen.

![statushome](../_media/ch-images/status-home.png ':class=imageclass80')

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
  - **One tab per question** — a home with one card per tab, providers, the graph, the process's performance, plugins, the rest of the extensions, the HTTP routes, the DCEs and the core's log. See [The tabs](#the-tabs).
  - **Filter by name or kind** — on the tabs that are lists, type part of a name and only the matches remain.
  - **Zero cost when closed** — no timer, no polling, no background collection. See [Cost](#cost).
  - **No payloads, ever** — it never shows the content of your logs or messages.

## Use
Select the cluster in the resource selector, add a **status** tab and start it. There is nothing to configure.

### The tabs

The content is split into ten tabs, and it opens on **Home**:

| Tab | What it answers |
|---|---|
| **Home** | the whole of it at a glance: one card per tab with its figures — see [Home](#home) |
| **Providers** | how is each **producer** of data doing — providers and pluviders, with their state, consumers and deliveries |
| **Graph** | who consumes whom — see [The graph](#the-graph) |
| **Performance** | how much the Kwirth **process** itself is using — see [Performance](#performance) |
| **Plugins** | which plugins are installed and what they have running. *Coming when the core tells channels about plugins.* |
| **Extensions** | the extensions that **do not produce** data — senders and webhooks today, the other kinds next |
| **Routes** | every HTTP route this Kwirth has published, and who published it — see [Routes](#routes) |
| **DCE** | the installed DCEs: whether each one loaded, where it came from and who consumes it — see [DCE](#dce) |
| **Log** | the core's own log, from the container running now — see [The core's log](#the-cores-log) |
| **Previous log** | the log of the previous container, when Kwirth has restarted — see [The core's log](#the-cores-log) |

The toolbar above the tabs is shared: the refresh button, the auto-refresh selector and the time of the
snapshot apply to **all** of them — a snapshot is of the whole Kwirth, not of one tab. The **Filter** box is
always there, and it is **disabled** on the tabs that are not lists (Home, Graph, Performance, the logs) —
it does not come and go, so nothing next to it moves. Status remembers the tab you were on when you come
back to it.

A tab whose data this version cannot show says so in words, instead of showing an empty table that could be
read as *"there is nothing"*.

### Home

Where the channel opens: **one card per tab**, three per row, all the same size and filling the screen. Each
card gives the figure that tab is about — how many producers and in which states, how many subscriptions, the
process's memory and CPU, how many routes and whether any collide, whether Kwirth has restarted — and
**clicking it opens that tab**. It reads the same snapshot the tabs do, so the numbers always match.

The **DCE** card counts the installed DCEs, how many extensions consume them and how many nobody uses, with a
red **broken** chip when one of them did not load — see [DCE](#dce).

![statusinventory](../_media/ch-images/status-inventory.png ':class=imageclass80')

### The Providers table

The table on the **Providers** tab has six columns (the **Extensions** tab has the same ones without
**Consumers** and **Delivered**, which are about producing data):

| Column | What it tells you |
|---|---|
| **Kind** | Provider or Pluvider (Sender or Webhook on the Extensions tab) |
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

Reporting consumers is optional, so a component that does not implement it shows a dash. A provider written
before this existed, or one that comes from elsewhere, shows one — and it keeps working exactly the same.
(Senders and webhooks have no such column at all: they are on the Extensions tab, and they do not produce.)

**This is on purpose.** Showing a `0` where the answer is unknown would read as *"nothing uses this"*, and
whoever read it might uninstall something that is very much in use. A dash cannot be misread.

### Idle is information, not a fault

An **Idle** provider is running correctly; it just has nobody listening. That is why its chip is grey and
not orange: it is not something to fix, it is something to decide about. It may be a provider you installed
and never wired to a channel, or one whose consumer you removed and forgot to clean up.

## The graph

The **Graph** tab is a **map of who feeds whom**.

![statusgraph](../_media/ch-images/status-graph.png ':class=imageclass80')

It reads top to bottom: **producers on top** — providers and pluviders — and **the channels that consume
them underneath**. A line from one to the other means that channel is subscribed to that provider.

### When a provider consumes another provider

A provider can subscribe to another provider — for example, one that enriches or aggregates what another
one produces. Then the graph has **more than two rows**, and every line still goes **down**:

  - **Top row**: the producers that consume nothing.
  - **Middle rows**: a provider that consumes another one sits **below the one it reads**. If it reads a
    provider that itself reads another, it goes one row further down, as deep as the chain needs.
  - **Bottom row**: the channels, always together, whatever they consume.

So with providers **A** and **B**, a provider **C** subscribed to **B**, and a channel reading all three, you
see A and B side by side on top, C underneath B, and the channel at the bottom with a line from each of
them. The line from B to C ends on C's own box — a provider that consumes is the same box as the provider
that produces, not a copy of it.

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
destinations and entry points, not part of these subscriptions. They are on the **Extensions** tab.

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

## Performance

How much the **Kwirth process** is using, read by Status's own back end — which runs inside that process.

![statusperformance](../_media/ch-images/status-performance.png ':class=imageclass80')

Five figures on top, each with its own colour and icon:

| Figure | What it is |
|---|---|
| **Memory (RSS)** | what the operating system has given the process |
| **JS heap** | JavaScript memory used / reserved |
| **CPU** | the share of one core used since the previous snapshot — it can go above 100 %, because Node uses more than one thread |
| **Event loop delay (p99)** | how late the process answers, with the mean and the maximum below; it is what you feel when Kwirth goes slow |
| **Uptime** | how long the process has been running, with its pid and Node version |

Below, a small chart per question — memory, CPU, event loop — drawn from the snapshots taken **while the
channel is running**, in the same colour as their figure. The series lives in your browser and is thrown away
when you stop the channel: it is a view of the session, not a history. If Kwirth restarts, the series starts
over — a line joining two different processes would show a drop that happened to neither.

**CPU and the event loop need two snapshots.** The CPU is the difference between two of them, and the
event-loop delay is measured only while somebody is looking — so the first snapshot shows a dash for both, and
says why. A dash is not a zero.

Everything here is the whole process: every extension runs inside it, so nothing can be attributed to one of them.

## Routes

Every **HTTP route** this Kwirth has published, **one line per path** with its methods as chips, and who
published it: the core's own API, a provider's router, a plugin's endpoints, the webhook receiver, the front.

![statusroutes](../_media/ch-images/status-routes.png ':class=imageclass80')

The header counts both **paths** (lines) and **routes** (one per method), and how many each owner published.
The filter matches a path, an owner, or an exact method — type `delete` and only the lines that answer DELETE
remain, with all their methods in view.

They are **patterns**, never values: the webhook receiver appears as `/webhook/:provider/:token`, and no
token, id or secret ever travels with the list.

### Collisions

Two extensions can publish the **same method at the same path** — two providers with the same alias, for
instance. Express answers with whichever was mounted first, and the other one simply **cannot be reached**,
with nothing anywhere saying so. Kwirth does not refuse the second one (yet); it records both, and this tab
marks both lines with a **collision** chip — the Home's Routes card counts them too. That is the thing to fix.

The list comes from the core's route registry. With a core older than it, the tab says the core does not list
its routes, instead of showing an empty table that would read as *"no routes"*.

## DCE

A **DCE** (*dynamic core extension*) is an object the core creates **once** and other extensions use by its
id — the shared part of a suite, which does not belong to the core. This tab lists every installed DCE, one
line each:

![statusdce](../_media/ch-images/status-dce.png ':class=imageclass80')

| Column | What it says |
|---|---|
| **DCE** | its display name, with its id underneath when they differ |
| **Version** | the version installed |
| **Back** | whether its back end loaded in the core: **Loaded**, **Failed** (with the reason written underneath), **Not loaded**, or **—** when it has none |
| **Front** | the same for its front end, **in this browser** |
| **Source** | where it was installed from: a marketplace URL, `dev`, `bundled`, `local` |
| **Consumed by** | the extensions that require it (`plugin nettools`), or *nobody* |

**Back and front are two states, not one.** The back end loads in the Kwirth process and comes with the
snapshot; the front end loads in your browser, and this tab reads it from the page you are looking at. One
half can be fine and the other broken — and whichever is broken fails every consumer that asks for it, with
nothing else on screen saying so. Broken DCEs sort first.

**Consumed by** is what the core itself uses to refuse uninstalling a DCE that is in use, or updating one
across a major version: it is the list of extensions whose package declares `dce:<id>:<version>` in
`requiresExtension`. A DCE nobody consumes is counted as **unused** in the header and on the Home card —
not a fault, but worth knowing before you keep it around.

The filter matches the id, the name, the version or a consumer. With a core older than this list, the tab
says the core does not list its DCEs, instead of an empty table that would read as *"no DCEs"*.

## The core's log

The **Log** tab shows the last **1000 lines** the container running now has written, with the colours Kwirth
put there. It is read when you open the tab and again with every snapshot, so the refresh button and
auto-refresh bring the latest lines. The **Previous log** tab shows the log of the previous container, when
Kwirth has restarted — with the restart count, the exit code and whether it ended cleanly or abnormally.

They used to live in **About kwirth…**; both are explained in detail, with what each message means, in
[Reading the core's own log](../guide/admin/01-deployment#reading-the-cores-own-log) and
[After an unexpected restart](../guide/admin/01-deployment#after-an-unexpected-restart).

Two things to know:

  - **Only administrators** can read them: the core's log carries its own internals. Without the `admin`
    scope, both tabs say so.
  - **They need Kwirth to run as a pod.** On desktop, docker or ECS there is no container log to read, and the
    tab says why rather than showing an empty box. Every state without lines is said the same way, centred.

The Home's **Previous log** card says *No restarts* or how many there have been, with an **abnormal exit**
chip when the last one crashed — the one case worth opening the tab for.

## Cost

**Zero while the tab is closed.** There is no timer, no subscription and no background collection: with the channel closed this plugin does not run a single instruction. When you open it, it reads state that is already in memory and sends one snapshot. The only thing that runs over time, the event-loop sampler behind *Performance*, is switched on with the first open tab and off with the last one.

That is a hard requirement, not an optimisation still pending. Kwirth sits in the path of your logs, and a tool that watches it must not slow it down.

## What it is not

  - **Not a monitoring platform.** No history, no time series, no alerts. It shows *now*. Your existing monitoring already covers CPU and memory of the pod, with more history and better alerting than this could offer.
  - **Not a debugger.** It never shows what a provider emits. To inspect the actual events, use the **Provider Debug** channel, which is built for whoever *writes* a provider — this one is for whoever *operates* a Kwirth.

## Permissions

The inventory is a privileged view: it lists every extension mounted in the server. Its scope level is **cluster**, so it is not available to users restricted to a namespace. The **Log** and **Previous log** tabs need, on top of that, the **admin** scope.

## Coming next

  - **Plugins** — each installed plugin, the channels it registers and how many instances and connections are live.
  - **All the extensions** — themes, homepages, logins, identity providers, AI toolsets, docs and packs join senders and webhooks on the Extensions tab.
