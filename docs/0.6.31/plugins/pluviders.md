# Pluviders — a plugin that also publishes

Some plugins do more than show things to their own front end. They run a **back end of their own**, always started, that produces genuinely valuable information: Agora raises proactive alerts after investigating metric anomalies and cluster events, Censor and Montag filter log messages down to what matters, Situs builds an enriched picture of external IP traffic.

Until now that information could only reach **one place**: that plugin's own front end. Another plugin that wanted to react to Agora's alerts had to re-implement the detection; one that wanted Censor's already-filtered logs had to filter them again.

A **pluvider** is a plugin that also publishes what it produces **in-process**, so any other plugin in the same kwirth can subscribe to it — exactly the way channels already subscribe to `events` or `metrics`.

> **One plugin, not two.** A pluvider is not a provider packaged next to a plugin. It is the **same class, the same instance and the same information**, reaching one more door.

## Why not just write a provider

[Providers](/0.6.31/providers/index) already distribute information between extensions, and they remain the right tool when the information **belongs to nobody in particular**: cluster events, metrics, a CRD being watched.

A pluvider is for the opposite case. The information is **the product of a plugin's own work** — a bot that investigated an incident, a filter the user configured, a correlation the plugin maintains. Extracting that into a separate provider would mean either duplicating the work in two processes, or building your own plumbing to share state between them. The pluvider keeps it in one instance, which is the whole point.

## How it works

A plugin already publishes what it produces somewhere. A pluvider adds **one more list of recipients at that same emission point** — it is not a second pipeline.

Agora is the clearest example, because the machinery was already there: it had a list of remote subscribers for **federation** (another cluster subscribing to its autonomous alerts over a WebSocket). Becoming a pluvider meant adding a second list of recipients — local channels, in-process — next to it:

```
                      +--------------------------------+
     alert            |  the plugin's emission point   |
     produced   ----> |  (already existed)             |
                      +----+---------+---------+-------+
                           |         |         |
                 its front-+         |         +- OTHER PLUGINS   <- what a pluvider adds
                                     |             (in-process)
                          federation-+
                          (websocket)
```

Nothing about how the alert is produced changes. What changes is how many places it can reach.

## Declaring a pluvider

The plugin's own channel class implements `IPluvider` alongside `IChannel`. There is no second class, no second `dist`, no second manifest entry:

```ts
import { IChannel, IPluvider, IPluviderData, IProviderSubscriber, IProviderSubscriptionHelp } from '@kwirthmagnify/kwirth-common-back'

class MyPluginChannel implements IChannel, IPluvider {
    readonly channelId = 'my-plugin'
    private subscribers: Set<IProviderSubscriber> = new Set()

    // Its PRESENCE is the declaration: a channel that implements this method offers itself
    // as a producer, and the core registers it. There are no flags to set.
    getPluviderData = (): IPluviderData => ({
        description: 'What this plugin produces, in one line',
        eventTypeName: 'IMyPluginEvent'      // optional: orients whoever consumes it
    })

    addSubscriber = async (c: IProviderSubscriber, _data?: unknown): Promise<void> => { this.subscribers.add(c) }
    removeSubscriber = async (c: IProviderSubscriber): Promise<void> => { this.subscribers.delete(c) }

    startProvider = async (): Promise<void> => { /* start producing, if it isn't already */ }
    stopProvider = async (): Promise<void> => { this.subscribers.clear() }

    getSubscriptionHelp = (): IProviderSubscriptionHelp => ({
        usage: 'What you receive, what the subscription payload looks like, and any gotchas.',
        example: {}
    })

    // …plus the whole IChannel contract, unchanged
}
```

And wherever the plugin already emits, it also hands the event to its in-process subscribers:

```ts
private publish(event: IMyPluginEvent): void {
    for (const subscriber of this.subscribers) {
        // Deliver defensively: one broken consumer must not take down the others,
        // nor the emission itself.
        try { subscriber.processProviderEvent('plugin:my-plugin', event) }
        catch (err) { this.backChannelObject.logError?.(`subscriber threw: ${err}`) }
    }
}
```

### Two details that bite

**`getSubscriptionHelp()` is mandatory here**, unlike in `IProvider` where it is optional. A provider is usually consumed by whoever wrote it; a pluvider is consumed by **another team**, who otherwise has no way to know what to subscribe with or what will arrive.

**The event's origin id is written literally** (`'plugin:my-plugin'`) rather than imported from `common`. A newly added export of `common` does not exist in a plugin's runtime until the core is rebuilt against that version, and an `undefined` there would leave the event with no recognisable origin.

## Consuming a pluvider

This is the part that requires **nothing new**. `processProviderEvent` has always been part of `IChannel`, so every channel already knows how to receive; and channels subscribe themselves, through `clusterInfo`. Subscribing to a pluvider is identical to subscribing to a provider — only the id differs:

```ts
readonly requirements: IBackChannelRequirements = {
    storage: false,
    providers: ['events', 'plugin:agora']     // a provider and a pluvider, side by side
}

startChannel = async (): Promise<void> => {
    this.clusterInfo.addSubscriber('events', this, { kinds: ['Pod'], syncInstances: false })
    this.clusterInfo.addSubscriber('plugin:agora', this, {})
}

processProviderEvent = (providerId: string, obj: any): void => {
    if (providerId === 'plugin:agora') { /* obj is an IAgoraAlert */ }
}
```

### Subscribing once per instance: the handle

`addSubscriber` subscribes **the channel**, and a channel is one object no matter how many tabs it is
serving. When you need a subscription **per instance** — one that can be paused, filtered or dropped on
its own — ask the core for a handle instead:

```ts
const producer = this.clusterInfo.getProvider('events', this)   // undefined if it is not here
producer?.subscribe(subscriber, { kinds: ['Pod'], syncInstances: false })
...
producer?.unsubscribe(subscriber)
```

The handle arrives already bound to both ends — the producer and your channel — so the core knows who
consumes what without you telling it, and your channel shows up in the Kwirth Status graph. Before this
existed, a channel that needed one subscription per tab had to reach for the provider object and call it
directly, which works but leaves the core blind.

It is **not** in the path of the data: the producer is handed the very same subscriber you pass, so events
travel straight to you, with nothing extra per event. And `subscribe` returns whatever the producer
returned — usually a promise — so a provider that fails while taking your subscriber on board can be
caught instead of becoming an unhandled rejection:

```ts
Promise.resolve(producer.subscribe(subscriber, data)).catch(err => { /* tell the user */ })
```

### The dependency is soft

If the producing plugin is not installed, or is not hosted by this kwirth, **the consumer still starts and still works**. The core logs a warning and moves on — it never fails the channel:

```
Pluvider 'plugin:agora' is required by a channel but is not available here
(its plugin is not installed, or is not hosted by this Kwirth)
```

This is deliberate. A plugin that enriches itself with Montag's filtered logs should not stop working because Montag is not installed. Note the difference in severity: a **provider** declared in `requirements` and not registered is a misconfiguration and is logged as an **error**; a missing **pluvider** is a legitimate situation and is logged as a **warning**.

### The subscription payload

Like providers, **each pluvider decides** whether it filters and what shape the filter takes — there is no common contract for it, and there never was for providers either (`events` takes `{ kinds, syncInstances }`, `metrics` takes booleans, `tick` takes nothing at all). Whatever your pluvider expects, describe it in `getSubscriptionHelp()`.

The two producers that ship today show the two shapes a filter tends to take:

| Pluvider | Payload | What it filters by |
|---|---|---|
| `plugin:agora` | `{ alerts: ['artifacts', 'metrics'] }` | the **kind** of alert: proactive rules on cluster events, or the metric anomaly detector |
| `plugin:montag` | `{ configs: ['payments', 'orders'] }` | **which configs**' issues you want, because Montag analyses several at once |

Both treat an **empty list as "everything"**, and that is worth copying. The alternative — empty meaning "nothing" — turns an incomplete subscription into a silence nobody can explain; this way the odd case is receiving too much, which is noticed immediately. In Agora's case "everything" also covers **kinds added in the future**, so a consumer written today does not quietly miss a new one.

Two more things worth stealing from them:

- **Sanitise what arrives.** The payload comes from another plugin. Agora drops values that are not a known kind instead of letting them into the filter: a filter that matches nothing would leave the subscriber silent with no explanation.
- **What the user enabled still wins.** A subscriber can ask for `artifacts` all it likes; with no proactive rules configured, Agora produces none. Say so in your help, or people will think their filter is broken.

### Build the help with live state

`getSubscriptionHelp()` is a method on the **instance**, not a static description, so it can look at what is actually happening. Montag uses this: its example carries the configs that are **analysing right now**, read from its live runners.

```ts
getSubscriptionHelp = (): IProviderSubscriptionHelp => {
    const analysing = this.analysingConfigNames()
    return {
        usage: '…',
        // real names if there are any, sample ones otherwise — and the field says which it is
        example: { configs: analysing.length > 0 ? analysing : ['payments', 'orders'] },
        fields: [ /* … */ ]
    }
}
```

The difference is not cosmetic: in Provider Debug, **USE EXAMPLE** then leaves the user's own installation in the form instead of names from a manual, ready to subscribe. If there is nothing live to offer, fall back to sample names **and say so** — an empty example would not even explain the shape.

Read it from memory rather than from storage where you can: `getSubscriptionHelp()` is synchronous, and live state is also more honest — a config saved but not running produces nothing, so offering it would be a lie.

## The identifier

A pluvider is always addressed with the prefix `plugin:`, and **the core composes the id** from the channel id — the plugin author never writes it, so the prefix cannot be mistyped:

| Producer | Id | Where it lives |
|---|---|---|
| Provider | `agora` | `clusterInfo.providers` |
| Pluvider | `plugin:agora` | the pluvider registry |

Because the two namespaces are separate, a provider and a plugin **can** share a name and both stay addressable without ambiguity. That is not an error and nothing is blocked — both extensions may well be third-party ones you do not control — but since the names are easy to confuse for a person, the core warns about it in three moments: when the plugin is installed, when the provider is installed, and on every startup.

## Start order

The core starts things in **three fixed phases**:

```
1. providers      →  2. pluviders      →  3. channels
   (events,           (startProvider()      (startChannel(),
    metrics, …)        of each one)          which is where
                                             consumers subscribe)
```

A pluvider therefore starts **before any channel**, so that by the time the first consumer subscribes, production is already alive.

Two consequences worth knowing:

- **Your producing side must not depend on `startChannel()` having run**, because it hasn't yet. Put the background work on the provider side; the front end hooks on afterwards.
- **The order within the pluviders phase is not guaranteed.** A pluvider that consumes from another pluvider may miss its first events. This is accepted rather than solved with a dependency graph — if it becomes a real problem, it gets revisited.

## What you see in the UI

A pluvider shows up in **Manage providers** even though it is not an installed provider. That is on purpose: whoever opens that dialog is there to see what they can subscribe to, and hiding pluviders would force them to know in advance that such a thing exists. What you **cannot** do there is manage it:

- it carries a **`pluvider`** chip, and its provenance shows an extension icon with the **name of its plugin** — it did not come from any marketplace;
- its **name and version are the plugin's**, because it is not versioned separately;
- **uninstall and configure are disabled, with the reason shown** — you uninstall the plugin, and you configure it from the plugin;
- the subtitle gives the id you need in order to subscribe: `Subscribe with id: plugin:agora`.

In the **Provider Debug** plugin, pluviders appear in the same drop-down as providers, marked with a `plugin` chip and their description, and can be subscribed to and inspected exactly like any provider.

## Limitations

- **A `SINGLE` plugin only publishes where it is hosted.** Agora declares `instances: SINGLE`, so on a desktop or docker kwirth it is announced as remote and not instantiated — and where there is no instance, there is no pluvider to subscribe to. The soft dependency is what makes this degrade gracefully instead of breaking.
- **It is in-process.** Same kwirth. It does not cross clusters — for that a plugin needs its own federation, as Agora has.

## Related

- [Consuming another provider](/0.6.31/providers/developing?id=consuming-another-provider) — the symmetric direction: a pluvider is a channel that also **produces**, and a provider can also **consume**
- [Autonomous plugins](/0.6.31/plugins/autonomous) — the plugin with its own always-running back end, which is the typical producer
- [Developing plugins](/0.6.31/plugins/developing)
- [Providers](/0.6.31/providers/index) and [Developing providers](/0.6.31/providers/developing)
- [Provider Debug](/0.6.31/plugins/reference/provider-debug) — subscribe to any producer and watch its raw events
