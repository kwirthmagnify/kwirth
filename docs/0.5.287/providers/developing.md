# Developing a provider
When developing a new provider you must implement this interface:

```typescript
export interface IProvider {
  readonly id: string
  readonly providesRouter: boolean 
  addSubscriber: (c:IChannel, data:any) => Promise<void>
  removeSubscriber: (c:IChannel) => Promise<void>
  startProvider: () => Promise<void>
  router: Router|undefined
}
```

Where:
  - `id`, is the id of the provider, the one the channels will use for reference.
  - `providesRouter`, if you need to receive HTTP requests from outside Kwirth, you must enable this and provide an Express router.
  - `addSubscriber`, a function for adding subscribers to your provider.
  - `removeSubscriber`, a function for removing subscribers from your provider.
  - `router`, if `providesRouter` is `true`, you must provide the Express router here. When you provide a router, the endpoint will be served at the Kwirth HTTP endpoint: '/&lt;rootPath&gt;/&lt;runningInstance&gt;/provider/&lt;providerId&gt;', where:
    - `rootPath` is the root path of Kwirth HTTP endpoints, typically `/` or `/kwirth`.
    - `runningInstance` is the id of the cluster instance once it is started.
    - `providerId` is the id of your provider.
    - Example: `/kwirth/23446-23446-23446-23446/provider/datastream` (being `datastream` the id of the provider).
