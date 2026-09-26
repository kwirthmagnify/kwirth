# Developing a provider

> **Is a provider what you need?** If the information you want to distribute is produced by a **plugin
> you are already writing** — the result of its own work, not an external source anyone could read —
> then a separate provider would duplicate that work in a second process. Your plugin can publish it
> in-process instead, keeping one instance: see [Pluviders](/0.6.31/plugins/pluviders). A provider
> remains the right tool when the information belongs to nobody in particular.

When developing a new provider you must implement this interface (exported by
`@kwirthmagnify/kwirth-common-back`):

```typescript
export interface IProvider {
  readonly id: string
  readonly providesRouter: boolean
  readonly requiresApiKeyApi: boolean
  addSubscriber(c: IProviderSubscriber, data: any): Promise<void>
  removeSubscriber(c: IProviderSubscriber): Promise<void>
  updateSubscription?(c: IProviderSubscriber, data: any): Promise<void>
  startProvider(): Promise<void>
  stopProvider(): Promise<void>
  router: Router | undefined
  routerAlias: string | undefined
  readonly rawBody?: boolean
  configRouter?: Router
  apiKeyApi: any | undefined
}

export type TProviderConstructor =
  new (clusterInfo: any, kwirthData: KwirthData, storage?: IProviderStorage) => IProvider
```

Where:

  - `id`, the id of the provider, the one channels use to refer to it.
  - `providesRouter`, enable it if you need to receive HTTP requests **from outside kwirth**, and provide an
    Express router in `router`. This route is **public**: it is where an OTLP exporter or a third-party
    system POSTs data, so it cannot demand a kwirth accessKey. Anything you expose there is your
    responsibility to protect.
  - `addSubscriber` / `removeSubscriber`, to manage your subscribers. `data` is whatever the channel passes
    when subscribing — that is the channel's own selection, not your configuration.
  - `updateSubscription`, optional, lets a channel change its selection without unsubscribing first.
  - `router`, the public Express router, served at
    `/<rootPath>/<runningInstance>/provider/<providerId>`, or at `/<rootPath>/provider/<routerAlias>` when
    you set a `routerAlias`.
  - `rawBody`, opt in to receiving the **raw body** (a `Buffer`) on your public router, untouched by
    kwirth's global JSON parser. You need it for anything that is not plain JSON — ndjson, msgpack,
    protobuf — or to verify a signature over the exact bytes that arrived. **Without it your router gets
    the body already parsed**, because kwirth's `bodyParser.json()` runs before your routes: a
    `Content-Type` it does not understand (say `application/x-ndjson`) leaves you with an empty body, and
    a batch larger than the global limit is answered with a **413** before your code ever runs. The
    default is off, so providers that read `req.body` as an object keep working unchanged.
  - `configRouter`, **your own management endpoints** — see below.
  - `getSubscriptionHelp`, optional, to document how to subscribe to you — see below.

## Documenting how to subscribe to you

The `data` argument of `addSubscriber` is a contract only you know. A consumer looking at your
provider has no way to guess it, and most providers deliver **nothing at all** with an empty
payload — which looks like a bug rather than a missing option.

Implement the optional `getSubscriptionHelp()` and kwirth will show your notes wherever a user has
to write that payload (the **[Provider Debug](/0.6.31/guide/extensions/plugins/provider-debug)**
channel does exactly this):

```ts
getSubscriptionHelp = (): IProviderSubscriptionHelp => ({
    usage: 'Strict opt-in: an object is delivered only if its kind is listed in "kinds".\n' +
           'Subscribing with {} therefore receives nothing at all.',
    example: { kinds: ['Pod', 'Event'], syncInstances: false },
    fields: [
        { name: 'kinds', type: 'string[]', required: true, description: 'Kubernetes kinds to receive' },
        { name: 'syncInstances', type: 'boolean', description: 'Also receive instances of watched CRDs' }
    ]
})
```

- **`usage`** — prose. Say what you deliver, what is required to receive anything, and the gotchas.
  This is the field that saves people time; write the thing you would have wanted to read.
- **`example`** — a payload that works, copied as-is into the subscription.
- **`fields`** — optional, and only worth declaring when your payload is **flat**: consumers can
  then render a form instead of asking for hand-written JSON. If your payload is nested, leave it
  out and let `usage` and `example` do the work.

It is optional and it is read defensively: not implementing it, or throwing, degrades to "this
provider does not publish subscription help" without affecting anything else.

> Do not confuse it with the `schema` you export from your `back.js`. That one describes **your own
> configuration** (what an administrator sets up); this one describes what a **consumer** sends you
> when subscribing.

## Configuring your provider

A provider **owns its configuration**: it serves it, validates it and persists it, exactly like a channel
does. Two pieces make this possible.

### 1. `configRouter` — your own authenticated endpoints

Expose an Express router in `configRouter` and the core mounts it at
`/<rootPath>/core/providerconfig/<providerId>`, **always behind accessKey validation**. You do not write any
authentication code: by the time a request reaches your router, the core has already validated the key,
the same way it does for a channel's endpoints.

```typescript
this.configRouter.route('/configs')
    .get(async (_req, res) => res.status(200).json(this.getConfigs()))
    .put(async (req, res) => {
        const errors = validate(req.body)
        if (errors.length > 0) return void res.status(400).json({ errors })
        await this.applyConfigs(req.body)      // persist AND reconcile what is running
        res.status(200).json({ ok: true })
    })
```

Your front (`front.js`, registered on `window.__kwirth_providers__['<id>'] = { ConfigDialog }`) talks to that
path. Declaring a `configRouter` also makes the core **auto-instantiate** your provider at startup, so it
can be configured before any channel subscribes to it.

Note this is a **different route from `router`**: that one is public and receives external traffic,
this one is management and always authenticated. Do not mix them.

### 2. `IProviderStorage` — persistence with a Secret/ConfigMap switch

The core injects it as the **third constructor parameter**:

```typescript
export interface IProviderStorage {
    writeStorage(id: string, secret: boolean, data: any): Promise<void>
    readStorage(id: string, secret: boolean): Promise<any>
    writeStorageCommon(id: string, secret: boolean, data: any): Promise<void>
    readStorageCommon(id: string, secret: boolean): Promise<any>
}
```

The `secret` boolean decides where it lands: `true` → a Kubernetes **Secret**, `false` → a **ConfigMap**.
Your own namespace is `kwirth-store-provider-<id>`; the `Common` variants use the shared
`kwirth-store-common-<id>`, the same store channels and the AI configuration use.

**Split your configuration by sensitivity**, which is what channels do and what the storage is designed for:

```typescript
// credentials to a Secret, everything else to a ConfigMap
await storage.writeStorage('myprovider-configs', false, publicPart)
await storage.writeStorage('myprovider-creds',   true,  credentials)
```

Keeping urls, intervals and flags in a ConfigMap is not laziness: it lets an operator audit with `kubectl`
what the provider is doing, without exposing a single secret.

Read them back in `startProvider()` and recompose. The parameter is optional (`storage?`) for backwards
compatibility, so check it before using it and fail loudly if your provider cannot work without it.

### 3. `getConfigNames()` — let the manager count them for you

If your provider owns several configurations, implement it and the extension manager shows the count on your
card, exactly as it does for senders:

```typescript
getConfigNames = (): string[] => [...this.configs.keys()]
```

Names only, never values — it travels in the public provider listing. Like `getSubscriptionHelp()`, it is
optional and read defensively: not implementing it just means no counter.

## Writing to the log

Implement `setLogger()` and the core hands you a logger as soon as it builds your provider. It already
knows your id, so you write the message and nothing else:

```typescript
setLogger = (logger: IProviderLogger): void => { this.log = logger }
```

```
[12:21:07] [prov] [ERRO] [longhorn] informer error (engines): HTTP-Code: 404
```

It is optional and read defensively, like everything else here: keep a fallback that writes to the
console and your provider still works on an older core, with no minimum version to demand.

```typescript
private log: IProviderLogger = {
    info: (message: unknown) => console.log(`[${PROVIDER_ID}] ${message}`),
    warning: (message: unknown) => console.warn(`[${PROVIDER_ID}] ${message}`),
    error: (message: unknown) => console.error(`[${PROVIDER_ID}] ${message}`)
}
```

**Use `console.log` for nothing else.** It comes out with no timestamp, no level and no component, so
it cannot be filtered and, worse, a failure ends up looking exactly like a routine trace — which is
precisely how an unreachable API or a dead informer goes unnoticed for weeks. Choose the level on
purpose: `error` when something did not happen, `warning` when it happened but degraded (a quota with
no usage, a CRD that is not there), `info` for the rest.

If some of your traces come from plain functions rather than from the class, keep a module-level
logger and have `setLogger()` replace that one too, instead of importing the provider from them.

## Consuming another provider

A provider does not only produce. It can also **subscribe to another provider** — typically when
something it needs is owned by someone else, such as configuration shared by several providers.

Ask the core for a handle and subscribe with it. Never reach into `clusterInfo.providers` yourself: the
handle is what keeps the core's registry of who-consumes-what true, and going around it makes your
subscription invisible to everything built on that registry.

```typescript
onProvidersReady = async (): Promise<void> => {
    const handle = this.clusterInfo?.getProvider('some-provider', this)
    if (!handle) {
        this.log.warning('some-provider is not available here: continuing without it')
        return
    }
    await Promise.resolve(handle.subscribe(this, { /* subscription payload */ })).catch(
        err => this.log.error(`could not subscribe to some-provider: ${err}`))
    this.producer = handle
}

stopProvider = async (): Promise<void> => {
    this.producer?.unsubscribe(this)      // 🔴 not optional, see below
    this.producer = undefined
}
```

⚠️ **Subscribe from `onProvidersReady()`, never from `startProvider()`.** The core calls it once, when
every provider and pluvider is already registered. From `startProvider()` you may or may not find your
producer depending on the order things were instantiated in, which is not something you can see from
your own code — so it would work on one Kwirth and not on the next.

🔴 **Whatever you subscribe to, unsubscribe in `stopProvider()`.** Skipping it does not leak one object:
the producer keeps handing events to an instance nobody uses any more, and every hot reload leaves
another ghost behind holding whatever that instance held. That failure does not announce itself — it
shows up later as whatever resource the ghosts are holding running out.

`getProvider()` answering `undefined` is a legitimate answer, not an error: the other provider may
simply not be installed here. Say so and carry on — a **soft** dependency, the same way a channel deals
with a pluvider that is not there. If you genuinely cannot work without it, you are the one who knows
how to complain about it.

> Your subscriber is whatever you pass as the first argument to `subscribe()`, and it needs
> `processProviderEvent(providerId, payload)`. Passing `this` is the simple case; pass a separate object
> per subscription if you need to hold several.

### Declaring what you consume

Kwirth does not start every installed provider. It creates the ones **a channel asks for**, plus the
ones that expose a `router` or a `configRouter`, and no others. A producer that only **another
provider** needs fits neither case, so without help it is never created, and your `getProvider()`
returns `undefined` even though the producer is installed.

List the providers you consume in `requirements`. This is the same list a channel declares:

```typescript
readonly requirements = { providers: ['some-provider', 'another-provider'] }
```

When your provider is created, the core also creates the ones you list, then the ones **they** list,
and so on. It does this both at startup and when a plugin that brings you in is installed without a
restart. Nothing is created twice, and a cycle between two providers is harmless. It all happens
before `onProvidersReady()`, so by the time you subscribe, whatever you declared is already running.

A few things to keep in mind:

- **It is still a soft dependency.** A listed provider that is not installed produces a warning in
  the log (`Provider 'yours' consumes 'some-provider', which is not installed`) and startup carries
  on. You still have to handle `getProvider()` returning `undefined`, as explained above.
- **Do not list pluviders** (`plugin:<name>`). A pluvider exists when its plugin is installed, and
  the core cannot create one, so it skips those ids. Ask for it with `getProvider()` anyway: it will
  be there when the plugin is.
- **Declare only what you really consume.** Everything you list starts running, together with its
  polling, quotas and connections, as soon as you do.
- `requirements` is optional. An older core ignores it, and you do not need a newer
  `kwirth-common-back` to declare it: a plain property with that shape is enough.

In the startup log, a producer created this way shows up as
`Provider 'some-provider' is consumed by provider 'yours', instantiating it`.

## Deprecated: core-managed configuration

Older providers received their configuration through `configure(config)`, fed by the core from a ConfigMap
it managed (`kwirth-provider-<id>-config`), edited either from a generic schema-driven form (built from a
`schema` array exported by your `back.js`) or from a custom front calling
`/core/providers/<id>/config`.

That path still works and is not going away for now, but **do not use it for new providers**. Its
limitations are why the model above exists:

  - The core only calls `configure()` **when it instantiates the provider**, so saving from the UI does not
    reach a running instance — changes need a restart.
  - The generic form is a **flat** list of `string | number | boolean | password` fields for a single
    object: it cannot express a list, nested objects, or fields that appear depending on what the user
    picked.
  - The configuration is an opaque blob the core stores in a **ConfigMap**, so a provider cannot decide
    that one field is a credential and belongs in a Secret.

## Testing

Take the dependency injection seriously: pass whatever talks to the outside world (an HTTP client, a
socket, a Kubernetes API) as a constructor parameter with a real default. Your tests then inject a fake and
run with no network and no cluster. Both `providers/http-pull-push` and `providers/business` are built that
way and their suites run with plain `node:test`.
