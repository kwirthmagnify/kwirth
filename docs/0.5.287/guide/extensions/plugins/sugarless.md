# Sugarless (plugin)

> **Type:** Plugin — channel (installable)<br>
> **Package:** `@kwirthmagnify/kwirth-plugin-sugarless`<br>
> **Requires:** the [Sugarless provider](../providers/sugarless)

## What it does

Charts continuous glucose monitor readings in real time. That is all it does: the account, the polling and
the history all belong to the [provider](../providers/sugarless), and this channel draws what arrives.

> **This is a demo, not a medical device.** Do not use it for treatment decisions.

## Why it exists

It is the shortest answer to "isn't kwirth a Kubernetes tool?". Open the tab and there is a live chart of
somebody's blood sugar, with no pod, no namespace and no container anywhere in the flow.

And it is not just rhetorical: Sugarless is the first **autonomous channel** in kwirth. It declares that it
needs nothing from the cluster, so it starts with the **`none`** view and never asks for cluster-wide
access. A channel that never looks at a pod should not need a key that can see every pod.

## Starting it

**ADD** → pick your cluster → **View: `none`** → **Channel: `sugarless`** → **ADD**.

The `none` view exists for channels like this one. Choosing it disables the namespace, controller, pod and
container selectors, because there is nothing to select: the channel does not read cluster objects.

You still pick a cluster, and that is not a contradiction — what you are choosing there is **which kwirth
runs the provider**, not what gets inspected.

Then start the channel from the tab settings (**⚙ → Start**).

## What you see

| | |
|---|---|
| **The number** | The latest reading, in the unit your Abbott account uses. Coloured by the high/low flags the API itself provides — never recalculated here. |
| **The arrow** | The trend Abbott reports: falling fast, falling, stable, rising, rising fast. |
| **The band** | The target range **configured in your own Abbott account**, not a value invented by kwirth. |
| **The line** | The readings, placed at the sensor's own timestamps — not at the times kwirth happened to poll. |

Pausing the tab freezes the chart. It does **not** stop the provider, which keeps collecting, so when you
resume you have not lost anything.

## When there is no chart

There are four reasons for an empty chart and they are deliberately kept apart, because what you should do
about each one is different:

| What the tab says | What it means | What to do |
|---|---|---|
| **Sugarless not started** | The channel is open but not running | Start it: tab settings **⚙ → Start** |
| **Waiting for the first reading** | Running, nothing collected yet | Wait. The sensor emits roughly every 15 minutes |
| **No current reading** | The connection is fine; the patient's phone has not synced | Nothing. **This is not a failure** |
| **Something needs fixing** | Credentials, client version, no followed patient… | Read the message; most cases are fixed in the provider's dialog |

That third one is worth dwelling on: LibreLinkUp does not read the sensor, it reads what the patient's app
has uploaded to the cloud. A phone that has been in a pocket with no signal produces no current value, and
that is the normal case, not an incident. Raising an alarm for it would be crying wolf several times a day.

## Configuration

**None.** Everything configurable lives in the provider, so this channel has nothing to set up. If the
chart is empty and the message points at credentials, the place to go is
**☰ → Manage extensions → Providers → Sugarless ⚙**.
