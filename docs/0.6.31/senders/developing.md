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

### Field types

`getConfigSchema()` returns `ISenderFieldDef[]` — the common `IConfigFieldDef` that senders, webhooks,
IdP connectors, logins and providers share — and Kwirth draws the form from it.

| `type` | drawn as |
|---|---|
| *(omitted)* / `text` | a single-line text field |
| `number` | a numeric field |
| `boolean` | a switch |
| `password` | a masked field with an eye; emptied in a Kwirth export without credentials |
| `select` | a dropdown fed by `options` (labelled by `labels`) |
| `multiselect` | a dropdown of several values, stored as one comma-separated string |
| `json` | today, a single-line text field |
| `textarea` | a **multi-line**, monospaced field of fixed height that scrolls inside. Line breaks, tabs and backslashes are kept exactly as typed: use it for scripts, templates, keys |

Two flags change how a field is treated:

- **`secret: true`** — the value is a secret. Meant for multi-line secrets on a `textarea` (an SSH
  private key), which a single-line `password` would break. It gets the eye, it is emptied in an export
  without credentials, and it is **never sent to an LLM**. Like every secret in Kwirth, it is stored and
  returned real.
- **`aiInstructions: '…'`** — the field can be [drafted by an LLM](../guide/extensions/ai-assist.md). The
  text is the context you give the model for **this** field: what the value is, the contract it must
  follow, the form of the answer. The core adds the other (non-secret) fields of the form and the user's
  request; the model answers with the value only, and it lands in the field unsaved. Honoured today on
  `textarea` fields.

```typescript
{ name: 'script', label: 'Script', type: 'textarea', required: true,
  aiInstructions: 'A shell script run once per message. The message body arrives on stdin. Exit 0 on success.' },
{ name: 'sshPrivateKey', label: 'SSH private key', type: 'textarea', secret: true },
```

### Consuming a provider from your sender

A sender can subscribe to a provider — typically to take shared configuration from it, such as the
cloud accounts a sender that emails through SES needs. Declare what you consume in `requirements` and
subscribe in `onProvidersReady(access)`; the core hands you an access already bound to your identity
(`sender:<id>`), and unsubscribing in `stopSender()` is not optional. The mechanism is the same for every
extension family and is described once, in
[Consuming a provider from any other extension](../providers/developing.md#consuming-a-provider-from-any-other-extension).

### Hot-reload for development

Point kwirth at your local build output via `kwirth-dev.json`:

```json
{
  "senders": {
    "my-sender": "../senders/my-sender/dist"
  }
}
```

Kwirth watches `dist/back.js` and hot-reloads the sender whenever the file changes.
