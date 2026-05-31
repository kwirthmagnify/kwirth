# Daemons

Starting with version 0.5, Kwirth supports **daemons** — headless backend workers that run continuously inside Kwirth without requiring a user to open a tab or establish a WebSocket session. Daemons are the server-side counterpart of plugins: they perform the same kinds of processing (log analysis, event watching, data forwarding) but operate autonomously in the background.

## How daemons work

| Aspect | Plugin | Daemon |
|---|---|---|
| Triggered by | User opening a tab | Kwirth startup / API call |
| UI | Yes — front plugin renders a React tab | None — headless |
| Session | Tied to a WebSocket connection | Independent, survives reconnects |
| Use case | Interactive exploration | Continuous background processing |

A daemon is a Node.js module that implements the `IDaemon` interface from `@kwirthmagnify/kwirth-common-back`. Like a plugin, it has access to storage, providers, senders, and the Kubernetes API through its runtime context (`IBackDaemonObject`).

Daemons are loaded from the same hot-reload mechanism as plugins: they can be installed as `.tgz` bundles, loaded from a URL, or pointed at via `kwirth-dev.json` during development.

## Daemon lifecycle

1. **startDaemon** — called once when Kwirth starts (or when the daemon is installed at runtime). The daemon initialises its state, loads configuration from storage, and subscribes to providers.
2. **addObject / deleteObject** — called when Kubernetes resources matching the daemon's scope are added or removed.
3. **processCommand** — handles management commands sent via the Kwirth API (e.g. get/set config, start/stop analysis).
4. **stopDaemon** — called on graceful shutdown.

## The IDaemon interface

```typescript
export interface IDaemon {
    readonly daemonId: string
    getDaemonData(): BackDaemonData
    startDaemon(): Promise<void>
    containsInstance(instanceId: string): boolean
    containsAsset(instanceId: string, ns: string, pod: string, container: string): boolean
    addObject(instanceConfig: IDaemonInstanceConfig, ns: string, pod: string, container: string): Promise<boolean>
    deleteObject(instanceConfig: IDaemonInstanceConfig, ns: string, pod: string, container: string): Promise<boolean>
    processCommand(instanceId: string, command: string, data?: unknown): Promise<unknown>
}
```
