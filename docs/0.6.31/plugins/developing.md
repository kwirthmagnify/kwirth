# Developing your own plugin

If you want to build a custom plugin, you need to implement two TypeScript interfaces: one for the back side and one for the front side. The back interface defines how your plugin integrates with kwirth core (WebSocket routing, Kubernetes events, instance management), and the front interface defines the React components (setup dialog, tab content) and the lifecycle callbacks.

The simplest way to start is by looking at the **Echo** plugin, which is the official reference implementation:

- [echo back channel on GitHub](https://github.com/kwirthmagnify/kwirth/tree/master/plugins/echo/src/back)
- [echo front channel on GitHub](https://github.com/kwirthmagnify/kwirth/tree/master/plugins/echo/src/front)

For the full interface specification and all available data structures, see the [Developing](../developing) section.

Two variations worth knowing before you start:

- an [autonomous plugin](/0.6.31/plugins/autonomous) needs nothing from the cluster, which is what lets you embed a standalone application as a kwirth channel;
- a [pluvider](/0.6.31/plugins/pluviders) is a plugin that **also publishes** what it produces, so other plugins can subscribe to its information in-process.

## Permissions: declaring your scopes

🔴 **The core does not authorise your channel for you.** It checks that the key is valid and that it reaches your channel; what somebody may *do* inside it is yours to decide. For a **cluster** channel (`resourced: false`) the core does not even check the resources — `checkAkr` is never called — so a channel that reads nothing of its key grants everything to anybody who can open it.

A channel declares its vocabulary with two methods:

```ts
// the ladder: each level grants everything below it, and -1 for anything it does not know
getChannelScopeLevel = (scope: string): number =>
    ['', 'mychan$user', 'mychan$read', 'mychan$write', 'cluster', 'admin'].indexOf(scope)

// what the security editor offers for your channel
getScopeCatalog = (): IExtensionScope[] => [
    { scope: 'mychan$user',  label: 'My Channel · User',  description: 'Open it' },
    { scope: 'mychan$read',  label: 'My Channel · Read',  description: 'Also read its data' },
    { scope: 'mychan$write', label: 'My Channel · Write', description: 'Also change things' }
]
```

Name them `<channel>$<scope>` so they never collide, and always put `cluster` and `admin` at the top: an administrator must not be locked out of a channel by its own ladder.

Then check, wherever it matters — `keyAllows()` of `kwirth-common-back` walks the key's resources against your ladder:

```ts
import { keyAllows } from '@kwirthmagnify/kwirth-common-back'

if (!keyAllows(accessKey, 'mychan$write', this.getChannelScopeLevel)) { /* refuse */ }
```

> ⚠️ **Declaring a scope nobody can be given, or checking one nobody declares, is worse than no scope at all.** A permission that can be granted and does nothing has appeared repeatedly in this product. If you declare it, enforce it; if you enforce it, declare it so an administrator can grant it.

## Narrowing a scope (thin scopes)

Some permissions are not all-or-nothing: *read everything except Secrets*, *write only under `/tmp`*. The core cannot express that — it does not know what a Secret or a path is to your channel. So the channel describes the limit and the core carries it.

Add a `config` to the catalogue entry, and it becomes a **form** the administrator fills in from the gear next to that scope:

```ts
{
    scope: 'mychan$read',
    label: 'My Channel · Read',
    description: 'Also read its data',
    config: [{ name: 'hideKinds', label: 'Hidden kinds', type: 'multiselect', options: ALL_KINDS }]
}
```

What gets stored is a single token — `mychan#read#<base64>` — beside the usual `mychan$read`. The administrator never sees or types the encoded part. Read it back with `parseThinScope()`:

```ts
import { parseThinScope } from '@kwirthmagnify/kwirth-common'

const thin = parseThinScope(token)
// undefined  → not a thin scope (a classic one, or rubbish). Grant NOTHING from it.
// otherwise  → { channel, scope, wide, config }
//   wide   is 'mychan$read', which is what your ladder is written in
//   config is what you put in the form, and only you know its shape
```

`parseThinScope` **never throws**: a malformed token, broken base64 or invalid JSON all return `undefined`. And a token aimed at a channel you do not know scores -1 on your ladder, so it grants nothing without you writing a line for it.

### Four things that will bite you

1. 🔴 **The wider form wins.** Resources are combined with OR, so a key holding both `mychan$read` and a narrowed `mychan#read#…` reads **everything**: the limit does nothing. The security editor keeps the two apart and warns when it sees both, but a key built by hand through the API can carry them.
2. 🔴 **Close every exit, not just the obvious one.** Magnify filtered its listings and a hidden Secret still arrived through the live event feed the moment somebody touched it. Enumerate every way your channel sends data out — listings, feeds, downloads, exports — and apply the same check to all of them.
3. 🔴 **Across several resources the limits INTERSECT, they do not add up.** If one resource hides `Secret` and another hides `ConfigMap`, the second one grants Secrets. That is what OR means, and the intuition says the opposite.
4. **Version your config.** If v1 reads it as a prefix and v2 adds globs, a key written for v2 running on v1 is read as a literal. The format is Kwirth's; the meaning is yours, and so is keeping it compatible.

### How big it may be

The key travels in the `Authorization` header of **every** REST call the front makes, so the config is not free. A JSON of ~200 bytes is ~270 characters once encoded; three or four thin scopes come to about 1 KB against a practical ceiling of ~8 KB.

It will not break, but **the config is not the place for a list of a hundred namespaces**. If a limit needs that much, it belongs in your channel's own configuration, keyed by something small.

> ⚠️ Namespaces are **not** for the config: `resources` already carries a namespaces field, and it applies to every channel. Use the config only for what nobody but your channel can name.

[Magnify](https://github.com/kwirthmagnify/kwirth/tree/master/plugins/magnify/src/common) is the reference implementation: `MagnifyScopes.ts` declares the three scopes and the form, and `MagnifyAuth.ts` is the whole check — read by its back end to decide, and by its front end to avoid offering what the back will refuse.
