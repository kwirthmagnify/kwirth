# Developing a provider

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
  - `configRouter`, **your own management endpoints** — see below.
  - `getSubscriptionHelp`, optional, to document how to subscribe to you — see below.

## Documenting how to subscribe to you

The `data` argument of `addSubscriber` is a contract only you know. A consumer looking at your
provider has no way to guess it, and most providers deliver **nothing at all** with an empty
payload — which looks like a bug rather than a missing option.

Implement the optional `getSubscriptionHelp()` and kwirth will show your notes wherever a user has
to write that payload (the **[Provider Debug](/0.5.287/guide/extensions/plugins/provider-debug)**
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
