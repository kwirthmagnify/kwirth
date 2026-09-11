# Sugarless

Kwirth **channel plugin** that charts continuous glucose monitor readings in real time. It gets them
from the [`sugarless` provider](../../providers/sugarless), which talks to LibreLinkUp.

It exists to make a point: **Kwirth is not a Kubernetes tool.** Not a pod, not a namespace, not a
container appears anywhere in this flow — and this channel is the first one in the project that
declares itself **autonomous**, so it does not even ask for cluster access to open.

> **This is a demo, not a medical device.** Do not use it for treatment decisions. The reference band
> it paints is the target range your own Abbott account already has configured.

## First: the provider does the work

The plugin has **no configuration at all**. The LibreLinkUp account, the region, the polling interval
and the size of the history live in the provider, and an administrator sets them in
**☰ → Manage extensions → Providers**. Read [its README](../../providers/sugarless/README.md) first —
especially the part about needing a **follower** account, which is where everybody gets stuck.

## An autonomous channel

`getChannelData()` declares `cluster: false` **and** `resourced: false`. That combination means "this
channel needs nothing from the cluster", and the core then starts it with the **`none`** view: one
`addObject` call with empty selectors, no pod resolution, and none of the cluster-wide access-key
handling.

That is not a detail, it is the product argument. Declaring `cluster: true` instead — the only option
before the `none` view existed — would make the core register the instance as holding a cluster-wide
access key, which is unjustified privilege for a channel that never looks at a pod.

## One subscription per tab

The channel does **not** subscribe itself to the provider. Each instance — each open tab — registers
its own subscriber.

`startChannel()` runs once per channel, not per tab. Subscribing there would mean a freshly opened tab
triggers no emission at all, so its chart would stay empty until the next poll — with a one-minute
interval, that reads as broken. With a subscriber per instance, the provider hands each new tab its
whole window the moment it subscribes.

Pausing does **not** unsubscribe: the provider keeps filling its history and only the chart freezes.

## The four empty states

When there is no curve, the reason matters, because what the user should do differs. They are kept
apart deliberately, and the tab says which one it is without anyone opening a log:

| State | What it means | Who fixes it |
|---|---|---|
| **Not configured** | The provider has no credentials yet | An administrator, in the provider dialog |
| **Waiting** | Subscribed, no reading yet | Nobody: the sensor emits roughly every 15 min |
| **No current reading** | Connection fine, the patient device has not synced | Nobody: it is the normal case, **not a failure** |
| **Error** | Bad credentials, expired client version, no followed patient… | Depends — the message says |

## The chart

- The **target band** comes from the API (`targetLow`/`targetHigh` of the connection), not hardcoded:
  it is the patient's own configured range.
- The current value is coloured with the `isHigh`/`isLow` flags Abbott already computes.
- Values are shown in the account's unit and are **never converted**; the unit is labelled.
- The X axis uses the sensor's own timestamps (UTC-derived), never the polling time.

De-duplication happens in the provider, so the chart draws what it receives without filtering again —
duplicating that logic here would just be a second place to get it wrong.

## Its own icon

The icon is an inline SVG, not a name from the shared icon set. That set is served by the common
package, so a plugin wanting its own icon would have to add an export to `kwirthicons`, publish
`common-front` and rebuild the core — impossible for a third-party plugin. The core accepts a raw SVG
in the `icon` field of `package.json` (sanitized with a whitelist before it is painted), and
`getChannelIcon()` returns the same SVG inline. Same approach `trivy` takes with its distro icons.

## Development

```
npm install
npm run watch     # rebuilds dist/front.js and dist/back.js on every change
npm test          # node:test suite, no network and no cluster involved
```

Register it in `back/kwirth-dev.json` under `plugins`, and make sure the provider is registered too —
without it the channel opens and says the provider is not running.

**A change to `back.js` needs a core restart.** The dev watcher reloads the module but the channel
instance already running keeps the old code. Front-only changes reload on their own.
