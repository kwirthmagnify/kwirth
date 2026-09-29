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
3. A consumer — a plugin, a provider, a sender, a webhook, a theme, a homepage, an IdP connector or an AI toolset — gets the instance with `getDce<T>(id)` from `@kwirthmagnify/kwirth-common-back`.

Two consumers of the same DCE hold **the same object**. That is the whole point: one client, one cache, one registry, downloaded once and instantiated once.

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
"requiresExtension": ["dce:sample:0.1.0"]
```

Kwirth enforces it:

- **Installing a consumer** whose DCE is missing, or too old, is **refused** — the message says which DCE and which version.
- **Uninstalling a DCE** somebody requires is **refused**, and the message names who requires it.
- **Updating a DCE across a major version** (1.x → 2.0) while a consumer requires the old major is **refused** for the same reason: in semver, a new major means *this breaks*.

## Restart after an update

A DCE always declares `requiresRestart`. Installing one works hot — its factory runs right away, and a consumer installed afterwards finds it. **Updating** one does not replace what is already running: the consumers that got the previous instance keep it until the core restarts. The manager tells you so after an update; take the prompt seriously.

## When a factory fails

A DCE whose factory throws does **not** take the core down. It is marked **failed** with the cause, and a consumer asking for it gets that cause as an error — never an empty value. `getDce()` **throws** when a DCE is not loaded; it never returns `undefined`.

## Managing DCEs

Like every family, from **☰ → Manage extensions → DCE**: install from the catalog, a URL or a local package; update; remove. The listing shows, next to each DCE, how its back end is right now: **loaded**, or **failed** with its cause.

## Available DCEs

| DCE | what it provides |
|---|---|
| [Sample](sample) | a shared counter, to see with your own eyes that two consumers hold the same instance |

## Writing your own

Scaffold one from the repo root:

```
node tools/create-kwirth-dce.mjs --id my-icons --name "My Icons" --publisher @my-scope
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
import { getDce } from '@kwirthmagnify/kwirth-common-back'
const icons = getDce<IMyIcons>('my-icons')   // throws if it is not loaded, and says why
```

While developing, point kwirth at your build like any other extension:

```json
"dces": { "my-icons": "../dces/my-icons/dist" }
```

A change in `back.js` needs the core restarted: the factory runs once, at load.
