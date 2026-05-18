# Senders

Starting with version 0.5, Kwirth includes a **sender subsystem** — a standardized way for backend channels and providers to push outbound notifications or messages to external systems.

A sender is a self-contained backend plugin that knows how to deliver a message to a specific destination: a log file, the server console, an email inbox, a Slack channel, a webhook, etc. Channels and providers obtain a reference to the sender manager via their runtime context and use it to trigger outbound messages without knowing anything about the underlying transport.

## Architecture

The sender subsystem sits alongside the channel and provider subsystems inside the Kwirth backend. It is deliberately simple: senders are fire-and-forget output adapters, not two-way communication channels.

```
Channel / Provider
       │
       │  senders.send('console', 'my-config', { body: '...' })
       ▼
  SenderManager          ← implements ISenderAccess
  ┌──────────────────────────────────────────────────────┐
  │  consoleSender  ─►  stdout / stderr                  │
  │  fileSender     ─►  rotating log file                │
  │  dispatcherSender ─► fan-out to multiple senders     │
  │  <your sender>  ─►  email / Slack / webhook / ...    │
  └──────────────────────────────────────────────────────┘
```

Key design points:

- **Channels** receive the sender manager via `IBackChannelObject.senders`.
- **Providers** receive it via `ClusterInfo.senders`.
- **Senders themselves** receive it via `startSender(senders)`, enabling the **dispatcher pattern** (a sender that fans out to other senders).
- Each sender can hold **multiple named configurations**, so a single `FileSender` instance can write to several different log files simultaneously, each identified by a config name.

## The ISender interface

When developing a new sender you must implement this interface (from `@kwirthmagnify/kwirth-common-back`):

```typescript
export interface ISender {
    readonly id: string
    addConfig(config: ISenderConfig): void
    removeConfig(name: string): void
    hasConfig(name: string): boolean
    getConfigNames(): string[]
    send(configName: string, message: ISenderMessage): Promise<void>
    startSender(senders: ISenderAccess): Promise<void>
    stopSender(): Promise<void>
}
```

Where:

- `id` — unique identifier for the sender type (e.g. `"console"`, `"file"`).
- `addConfig(config)` — registers a named configuration on this sender. A config always has at least a `name` field; the rest is sender-specific (file path, SMTP settings, webhook URL, etc.).
- `removeConfig(name)` — removes a previously registered config.
- `hasConfig(name)` / `getConfigNames()` — queried by the sender manager before dispatching messages.
- `send(configName, message)` — delivers the message using the named config. This is the core method.
- `startSender(senders)` — called once when the sender instance is first created. Receives the `ISenderAccess` facade so the sender can call other senders (dispatcher pattern).
- `stopSender()` — called on graceful shutdown for cleanup (flush buffers, close file handles, etc.).

### ISenderMessage

Every `send` call receives an `ISenderMessage`:

```typescript
export interface ISenderMessage {
    subject?: string
    body: string
    to?: string | string[]
    level?: 'debug' | 'info' | 'warning' | 'error'
    metadata?: Record<string, unknown>
}
```

- `body` is the only required field.
- `subject` is a short headline (useful for email/Slack subjects).
- `to` is an optional recipient or list of recipients (meaningful for email/messaging senders).
- `level` maps to severity; built-in senders use it to colorize or filter output.
- `metadata` is a free-form bag for sender-specific extra data.

### ISenderConfig

Every config registered with a sender must extend:

```typescript
export interface ISenderConfig {
    name: string
    [key: string]: unknown
}
```

The `name` field is the config identifier used when calling `send(configName, ...)`. All other fields are sender-specific.

### ISenderAccess

Channels, providers, and dispatcher senders interact with the sender subsystem exclusively through this facade:

```typescript
export interface ISenderAccess {
    send(senderId: string, configName: string, message: ISenderMessage): Promise<void>
    addConfig(senderId: string, config: ISenderConfig): boolean
    listSenders(): Array<{ id: string; configNames: string[] }>
}
```

## Built-in senders

Kwirth ships with two reference senders:

| Sender id | Description | Config fields |
|---|---|---|
| `console` | Writes colorized output to `stdout` / `stderr` | `prefix?`, `timestamps?`, `levels?` |
| `file` | Appends to a log file with optional line-count rotation | `filePath`, `timestamps?`, `levels?`, `maxLines?` |

### console

Writes each message to the Node.js process console, using ANSI colors per severity level (cyan for `debug`, green for `info`, yellow for `warning`, red for `error`).

Config reference (`IConsoleSenderConfig`):

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Config identifier |
| `prefix` | `string` | `""` | String prepended to every line, e.g. `[KWIRTH]` |
| `timestamps` | `boolean` | `true` | Include ISO timestamp |
| `levels` | `boolean` | `true` | Include level tag like `[ERROR]` |

### file

Appends formatted lines to a file. If the file does not exist, its parent directory is created automatically. Supports line-count-based rotation: when the file exceeds `maxLines` the current file is renamed to `<path>.<timestamp>.bak` and a fresh file is started.

Config reference (`IFileSenderConfig`):

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Config identifier |
| `filePath` | `string` | — | Absolute or relative path to the log file |
| `timestamps` | `boolean` | `true` | Include ISO timestamp |
| `levels` | `boolean` | `true` | Include level tag |
| `maxLines` | `number` | `0` | Rotate after this many lines (0 = no rotation) |

## The dispatcher pattern

Because `startSender` receives the full `ISenderAccess` facade, a sender can delegate to other senders. This enables a **dispatcher** sender: one config entry that fans out to multiple transports.

```typescript
import { ISender, ISenderAccess, ISenderConfig, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

interface IDispatcherTarget {
    senderId: string
    configName: string
}

interface IDispatcherConfig extends ISenderConfig {
    targets: IDispatcherTarget[]
}

export class DispatcherSender implements ISender {
    readonly id = 'dispatcher'
    private configs = new Map<string, IDispatcherConfig>()
    private senders!: ISenderAccess

    async startSender(senders: ISenderAccess): Promise<void> {
        this.senders = senders
    }

    addConfig(config: ISenderConfig): void {
        this.configs.set(config.name, config as IDispatcherConfig)
    }

    removeConfig(name: string): void { this.configs.delete(name) }
    hasConfig(name: string): boolean { return this.configs.has(name) }
    getConfigNames(): string[] { return Array.from(this.configs.keys()) }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`DispatcherSender: config '${configName}' not found`)
        await Promise.all(
            config.targets.map(t => this.senders.send(t.senderId, t.configName, message))
        )
    }

    async stopSender(): Promise<void> {}
}
```

A channel would then send one message and have it automatically routed to, say, the file log and a Slack webhook simultaneously.

## Using senders from a channel

Inside a back channel, the sender manager is available on `backChannelObject.senders`:

```typescript
import { IBackChannelObject } from '@kwirthmagnify/kwirth-common'

class MyChannel implements IChannel {
    constructor(private clusterInfo: ClusterInfo, private bco: IBackChannelObject) {}

    async startChannel(): Promise<void> {
        await this.bco.senders?.send('file', 'audit-log', {
            level: 'info',
            subject: 'channel started',
            body: `MyChannel started on cluster ${this.clusterInfo.name}`
        })
    }
}
```

## Using senders from a provider

Inside a provider, the sender manager is available on `clusterInfo.senders`:

```typescript
async startProvider(): Promise<void> {
    await this.clusterInfo.senders?.send('console', 'default', {
        level: 'info',
        body: 'MyProvider started'
    })
}
```

## Developing your own sender

1. Create a new package (e.g. `senders/slack/`).
2. Add `@kwirthmagnify/kwirth-common-back` as a dependency.
3. Implement `ISender` and export the class as the default export.
4. Build to a single CJS bundle (e.g. using esbuild) as `dist/back.js`.

Minimal scaffold:

```typescript
import { ISender, ISenderAccess, ISenderConfig, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

export interface IMyConfig extends ISenderConfig {
    webhookUrl: string
}

export class MySender implements ISender {
    readonly id = 'my-sender'
    private configs = new Map<string, IMyConfig>()

    addConfig(config: ISenderConfig): void {
        this.configs.set(config.name, config as IMyConfig)
    }
    removeConfig(name: string): void { this.configs.delete(name) }
    hasConfig(name: string): boolean { return this.configs.has(name) }
    getConfigNames(): string[] { return Array.from(this.configs.keys()) }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`MySender: config '${configName}' not found`)
        // deliver message.body to config.webhookUrl ...
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}
    async stopSender(): Promise<void> {}
}

export default MySender
```

### Hot-reload for development

Point Kwirth at your local build output by adding a `senders` section to `kwirth-dev.json` in the backend working directory:

```json
{
  "channels": {
    "echo": "../plugins/echo/dist"
  },
  "providers": {
    "kafka": "../providers/kafka/dist"
  },
  "senders": {
    "my-sender": "../senders/my-sender/dist"
  }
}
```

Kwirth watches `dist/back.js` in each path and hot-reloads the sender whenever the file changes, giving you a fast edit → build → test cycle.
