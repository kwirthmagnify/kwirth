# Dynamic core extensions (DCE)

A **dynamic core extension** brings **objects**, not data and not screens. Kwirth calls its factory **once**, keeps what it returns, and any other extension can ask for it by id. It is where code that **several extensions share but that does not belong in the kwirth core** lives: a suite's icon set, a client for an external system, a cache, a registry.

> **Rule of thumb.** If an extension *produces data* (events, metrics, resources) it is a **provider**. If it *draws something the user opens* it is a **plugin**. If it *provides code or objects other extensions call* it is a **DCE**.

## How it works

```
   DCE package ──► kwirth calls create(host) ONCE ──► global.__kwirth_dce__[id]
                                                            │
                                     consumer: getDce<T>('id') ◄──┘
```

1. A DCE's `back.js` exports a **factory**: an object with a `create(host)` method. It does not export the shared object itself.
2. When the DCE loads, kwirth calls `create()` **once** and stores the result in a registry that hangs off a global.
3. A consumer — a plugin, a provider, a sender, a webhook, a theme, a homepage, an IdP connector or an AI toolset — gets the instance with `getDce<T>(id)`, from `@kwirthmagnify/kwirth-common-back` in the back end and from `@kwirthmagnify/kwirth-common-front` in the front end.

A DCE may bring a `front.js` too, and then the same thing happens in the browser: it registers its factory, kwirth calls it once, and the extensions on the page consume the result.

Two consumers of the same DCE hold **the same object**. That is the whole point: one client, one cache, one registry, downloaded once and instantiated once.

### One instance per side

A DCE is instantiated **once in the kwirth process** and **once in each browser page**. That is not a compromise, it is what there is: the back end's object lives in the server and the front end's in the page, and they cannot be the same one.

What the type guarantees is that, **within one side, everybody shares it**. Two plugins consuming the same DCE in the back end hold the same object; two channel tabs open in the same kwirth page hold the same one too. Open kwirth in a second browser tab and that page will have its own — a different document, a different instance.

Kwirth loads every DCE **before** any other extension family, and the front end does the same before adding any plugin, theme, homepage or configuration UI to the page. So a consumer can ask for its DCE the moment it starts, on either side.

**DCEs load first.** Kwirth loads every DCE before any other extension family, so a consumer can ask for its DCE the moment it starts.

## What the factory receives

The host hands `create()` four things:

| field | what it is |
|---|---|
| `id` | the DCE's own id, as installed |
| `logger` | `info` / `warning` / `error`, written under the DCE's id so its lines can be told apart in the core log |
| `configMaps` | a key-value store **scoped to this DCE** (kwirth prefixes the keys), for what it needs to persist |
| `secrets` | the same, backed by Secrets — for a DCE that instantiates a client with credentials |
| `libs` | the libraries kwirth publishes to every extension (common, common-back, common-ai, common-sql, express) |

A DCE has **no configuration dialog** in this version: it is code and objects only.

## Declaring the dependency

A consumer declares the DCEs it needs in its `package.json`, with the **minimum version**, using the same `requiresExtension` every extension already has:

```json
"requiresExtension": [{ "extensionType": "dce", "id": "sample", "minVersion": "0.1.0" }]
```

Kwirth enforces it:

- **Installing a consumer** whose DCE is missing, or too old, is **refused** — the message says which DCE and which version.
- **Uninstalling a DCE** somebody requires is **refused**, and the message names who requires it.
- **Updating a DCE across a major version** (1.x → 2.0) while a consumer requires the old major is **refused** for the same reason: in semver, a new major means *this breaks*.

## Restart after an update

A DCE always declares `requiresRestart`. Installing one works hot — its factory runs right away, and a consumer installed afterwards finds it. **Updating** one does not replace what is already running: the consumers that got the previous instance keep it until the core restarts.

And there is a second half the other families do not have: **the page has to be reloaded too**. The front end's instance lives in the browser, so the plugins, themes and homepages loaded in this tab go on using the one the previous version created. The manager says so after an update; take the prompt seriously, because nothing will look broken.

## When a factory fails

A DCE whose factory throws does **not** take the core down. It is marked **failed** with the cause, and a consumer asking for it gets that cause as an error — never an empty value. `getDce()` **throws** when a DCE is not loaded; it never returns `undefined`.

## Managing DCEs

Like every family, from **☰ → Manage extensions → DCEs**: install from the catalog, a URL or a local package; update; remove.

![Manage DCEs](../../../_media/guide/manage-dces.png ':class=imageclass80')

Two chips are the type's own, and they are there because a DCE fails differently from the rest:

| chip | what it says |
|---|---|
| **back + front** | which sides the package brought. Either may be missing, never both |
| **Loaded** / **Failed** | how its back end is **right now**. A DCE whose factory threw is installed and useless, and would otherwise look exactly like a healthy one — the **Failed** chip carries the cause in its tooltip, so you do not have to go to the server log to find out what broke |

There is **no gear**: a DCE has no configuration in this version. It brings code and objects, nothing to fill in.

## In a pack

A [pack](../packs/index) can carry a DCE together with the extensions that consume it. Kwirth **installs the DCEs first** and **removes them last**, so a pack works whatever order its members are listed in: a consumer is refused when its DCE is not there yet, and a DCE cannot go while somebody still requires it.

The author declares them like any other member:

```json
{ "extensionType": "dce", "id": "my-icons", "tgz": "my-scope-kwirth-dce-my-icons-1.0.0.tgz" }
```

And `packs/create-pack.mjs` takes `--include dce:my-icons`, reading from `dces/my-icons/dist`.

## Available DCEs

| DCE | what it provides |
|---|---|
| [Sample](sample) | a shared counter, to see with your own eyes that two consumers hold the same instance |
| [Net Tools](nettools) | DNS resolution and TCP reachability, from where kwirth runs. Spawns no processes |

## Writing your own

Scaffold one from the repo root:

```
node tools/create-kwirth-dce.mjs --id my-icons --name "My Icons" --publisher @my-scope
```

And a plugin that consumes it, with the dependency and the build mapping already in place:

```
node tools/create-kwirth-plugin.mjs --id my-plugin --dce my-icons:1.0.0
```

That leaves you `dces/my-icons/` with the contract, a back-end factory, a front-end registration, the build with the right globals, a harness and a README. The back end looks like this:

```ts
import { IDceBack, IDceBackHost } from '@kwirthmagnify/kwirth-common-back'

const dce: IDceBack<IMyIcons> = {
    create: async (host: IDceBackHost): Promise<IMyIcons> => {
        host.logger.info('my-icons created')
        return createMyIcons(host.id)
    }
}
export default dce
```

And a consumer:

```ts
import { getDce } from '@kwirthmagnify/kwirth-common-back'   // or /kwirth-common-front, in the front end
const icons = getDce<IMyIcons>('my-icons')   // throws if it is not loaded, and says why
```

⚠️ **Do not bundle the DCE's package into the consumer.** Install it for its **types** and let the build resolve it against the registry, the same way the common packages are resolved. A bundled DCE is a second copy of the code that builds its own object, and the one instance the type guarantees quietly becomes two. `dces/sample/consumer/build.mjs` in the kwirth repo carries the mapping, ready to copy.

⚠️ **The mapping hands back the instance, not the module.** Whatever your contract exports that is not part of that object — an **enum**, a constant, a helper function — is not there after the mapping, and a consumer that imports one gets `undefined` at runtime with nothing failing at build time. Declare those locally in the consumer and ask the registry only for the object. `plugins/nettools` does exactly that, and is the worked example of a real consumer.

While developing, point kwirth at your build like any other extension:

```json
"dces": { "my-icons": "../dces/my-icons/dist" }
```

A change in `back.js` needs the core restarted: the factory runs once, at load.
