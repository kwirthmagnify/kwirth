# Developing senders

## The dispatcher pattern

Because `startSender` receives the full `ISenderAccess` facade, a sender can delegate to other senders. This enables a **dispatcher** sender that fans out to multiple transports.

```typescript
import { ISender, ISenderAccess, ISenderConfig, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

interface IDispatcherTarget { senderId: string; configName: string }
interface IDispatcherConfig extends ISenderConfig { targets: IDispatcherTarget[] }

export class DispatcherSender implements ISender {
    readonly id = 'dispatcher'
    private configs = new Map<string, IDispatcherConfig>()
    private senders!: ISenderAccess

    async startSender(senders: ISenderAccess): Promise<void> { this.senders = senders }
    addConfig(config: ISenderConfig): void { this.configs.set(config.name, config as IDispatcherConfig) }
    removeConfig(name: string): void { this.configs.delete(name) }
    hasConfig(name: string): boolean { return this.configs.has(name) }
    getConfigNames(): string[] { return Array.from(this.configs.keys()) }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`DispatcherSender: config '${configName}' not found`)
        await Promise.all(config.targets.map(t => this.senders.send(t.senderId, t.configName, message)))
    }

    async stopSender(): Promise<void> {}
}
```

## Using senders from a channel

```typescript
class MyChannel implements IChannel {
    constructor(private clusterInfo: ClusterInfo, private bco: IBackChannelObject) {}

    async startChannel(): Promise<void> {
        await this.bco.senders?.send('email-smtp', 'alerts', {
            level: 'info',
            subject: 'Channel started',
            body: `MyChannel started on cluster ${this.clusterInfo.name}`
        })
    }
}
```

## Using senders from a provider

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
3. Implement `ISender` — include `getConfigSchema()` so the UI can render config forms without hardcoding anything.
4. Export the class as the default export.
5. Build to a single CJS bundle as `dist/back.js` (and write `dist/package.json` with `id`, `name`, `displayName`, `version`, `description`).

Minimal scaffold:

```typescript
import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

export interface IMyConfig extends ISenderConfig {
    webhookUrl: string
}

export class MySender implements ISender {
    readonly id = 'my-sender'
    private configs = new Map<string, IMyConfig>()

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name',       label: 'Name',        required: true },
            { name: 'webhookUrl', label: 'Webhook URL',  required: true },
        ]
    }

    addConfig(config: ISenderConfig): void {
        this.configs.set(config.name, config as IMyConfig)
    }
    removeConfig(name: string): void { this.configs.delete(name) }
    hasConfig(name: string): boolean { return this.configs.has(name) }
    getConfigNames(): string[] { return Array.from(this.configs.keys()) }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`MySender: config '${configName}' not found`)
        // POST message.body to config.webhookUrl ...
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}
    async stopSender(): Promise<void> {}
}

export default MySender
```

### Hot-reload for development

Point Kwirth at your local build output via `kwirth-dev.json`:

```json
{
  "senders": {
    "my-sender": "../senders/my-sender/dist"
  }
}
```

Kwirth watches `dist/back.js` and hot-reloads the sender whenever the file changes.
