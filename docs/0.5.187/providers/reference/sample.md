# Sample

The Sample provider is the **official reference implementation** for building custom Kwirth providers. It fires a simple heartbeat event to all subscribing channels every 10 seconds and demonstrates the minimal interface a provider must implement.

?> The Sample provider is intended for developers learning the provider API. It is not useful in production. Use it as a starting point when building your own provider.

## What it does

Every 10 seconds it calls `processProviderEvent` on each subscriber with:

```typescript
{ timestamp: number, message: 'sample heartbeat' }
```

## Implementing your own provider

Copy the Sample provider source and replace the interval logic with your own data source. A provider must implement the `IProvider` interface:

```typescript
interface IProvider {
    id: string
    providesRouter: boolean
    router: express.Router | undefined
    routerAlias: string | undefined
    requiresApiKeyApi: boolean
    apiKeyApi: ApiKeyApi | undefined

    addSubscriber(channel: IProviderSubscriber, config: any): Promise<void>
    removeSubscriber(channel: IProviderSubscriber): Promise<void>
    startProvider(): Promise<void>
    stopProvider(): Promise<void>
}
```

Set `providesRouter = true` and populate `router` if your provider needs to expose HTTP endpoints (like the [Business](business), [OTel](otel), or [Metrics](metrics) providers do).
