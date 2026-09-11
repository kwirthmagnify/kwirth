# Sugarless

Charts continuous glucose monitor readings in real time, from the
[sugarless provider](../../providers/reference/sugarless).

Installable plugin, package `@kwirthmagnify/kwirth-plugin-sugarless`. Declares
`requiresExtension: ["provider:sugarless:0.1.0"]`.

## The first autonomous channel

`getChannelData()` declares **`cluster: false` and `resourced: false`**. That combination means the channel
needs nothing from the cluster, and the core then starts it with the **`none`** view: one `addObject` call
with empty selectors, no pod resolution, and none of the cluster-wide access-key path.

Before that view existed the only option was declaring `cluster: true`, which makes the core register the
instance as holding a cluster-wide access key — unjustified privilege for a channel that never looks at a
pod, and noise in the audit trail.

If you are writing a channel whose data does not live in the cluster, this is the shape to copy.

## One subscriber per instance

The channel does **not** subscribe itself to the provider. Each instance — each open tab — registers its
own subscriber from `addObject`:

```ts
const subscriber: IProviderSubscriber = {
    processProviderEvent: (_id, obj) => this.deliver(socket, instance, obj as ISugarlessEvent)
}
provider.addSubscriber(subscriber, {})
```

The reason is that `startChannel()` runs **once per channel**, not per tab. Subscribing there means a tab
opened later triggers no emission at all, so its chart stays empty until the next poll — with a one-minute
interval, that reads as broken. With a subscriber per instance, the provider hands each new tab its whole
window the moment it subscribes.

Pausing sets a flag and stops delivery; it does **not** unsubscribe, so the provider keeps its history and
resuming costs nothing.

## Front state

The only logic in the plugin is deciding what the user sees when there is no curve, and it lives in a
reducer separate from the component, with no React, so it can be unit-tested:

```ts
enum ESugarlessStatus {
    NOT_CONFIGURED,   // the provider has no credentials
    WAITING,          // subscribed, nothing collected yet
    NO_DATA,          // connection fine, the patient device has not synced
    ERROR,
    OK
}
```

Those four empty states are kept apart because the user's next action differs in each one, and conflating
them is exactly what leaves somebody staring at a blank panel unsure whether to wait or call an
administrator. A fifth case is handled in the component: a tab that has not been started yet says so,
rather than claiming to wait for data it has not asked for.

## Chart

- The target band comes from `targetLow`/`targetHigh` in the event — the patient's own configured range.
- The current value is coloured with the `isHigh`/`isLow` flags the API already computes.
- Values are shown in the account's unit and **never converted**; the unit is labelled.
- The X axis uses the sensor's timestamps, never the polling time.

De-duplication happens in the provider, so the chart draws what it receives without filtering again.

## Its own icon

The icon is an **inline SVG**, not a name from the shared icon set. That set is served by the common
package, so a plugin wanting its own icon would have to add an export to it, publish and rebuild the core —
impossible for a third-party plugin. The core accepts a raw SVG in the `icon` field of `package.json`
(sanitized with a whitelist before painting), and `getChannelIcon()` returns the same SVG.

This is the recommended route for a plugin-specific icon; the shared set is for general-purpose icons.

## Configuration

None. The account, region, interval and history size all belong to the provider.
