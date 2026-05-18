# Senders

Starting with version 0.5, Kwirth includes a **sender subsystem** — a standardized way for backend channels and providers to push outbound notifications or messages to external systems.

A sender is a self-contained backend plugin that knows how to deliver a message to a specific destination: a log file, the server console, an email inbox, a Slack channel, a webhook, etc. Channels and providers obtain a reference to the sender manager via their runtime context and use it to trigger outbound messages without knowing anything about the underlying transport.

## Architecture

The sender subsystem sits alongside the channel and provider subsystems inside the Kwirth backend. It is deliberately simple: senders are fire-and-forget output adapters, not two-way communication channels.

```
Channel / Provider
       │
       │  senders.send('email-smtp', 'alerts', { body: '...' })
       ▼
  SenderManager          ← implements ISenderAccess
  ┌──────────────────────────────────────────────────────┐
  │  consoleSender    ─►  stdout / stderr                │
  │  fileSender       ─►  rotating log file              │
  │  emailResendSender ─► email via Resend API           │
  │  emailSmtpSender  ─►  email via SMTP                 │
  │  <your sender>    ─►  Slack / webhook / ...          │
  └──────────────────────────────────────────────────────┘
```

Key design points:

- **Channels** receive the sender manager via `IBackChannelObject.senders`.
- **Providers** receive it via `ClusterInfo.senders`.
- **Senders themselves** receive it via `startSender(senders)`, enabling the **dispatcher pattern** (a sender that fans out to other senders).
- Each sender can hold **multiple named configurations**, so a single `EmailSmtpSender` instance can deliver to several different SMTP accounts simultaneously, each identified by a config name.

## The ISender interface

When developing a new sender you must implement this interface (from `@kwirthmagnify/kwirth-common-back`):

```typescript
export interface ISender {
    readonly id: string
    addConfig(config: ISenderConfig): void
    removeConfig(name: string): void
    hasConfig(name: string): boolean
    getConfigNames(): string[]
    getConfigSchema?(): ISenderFieldDef[]   // optional — enables UI config forms
    send(configName: string, message: ISenderMessage): Promise<void>
    startSender(senders: ISenderAccess): Promise<void>
    stopSender(): Promise<void>
}
```

Where:

- `id` — unique identifier for the sender type (e.g. `"console"`, `"email-smtp"`).
- `addConfig(config)` — registers a named configuration. A config always has at least a `name` field; the rest is sender-specific.
- `removeConfig(name)` — removes a previously registered config.
- `hasConfig(name)` / `getConfigNames()` — queried by the sender manager before dispatching messages.
- `getConfigSchema()` — **optional**. Returns the list of fields that define a config for this sender. When implemented, the Kwirth management UI uses this schema to render a type-safe form for adding new configs, so no frontend code needs to know the config structure. See [ISenderFieldDef](#isenderfielddef) below.
- `send(configName, message)` — delivers the message using the named config. This is the core method.
- `startSender(senders)` — called once when the sender instance is first created.
- `stopSender()` — called on graceful shutdown.

### ISenderFieldDef

Defines one field in a sender config form:

```typescript
export type SenderFieldType = 'text' | 'number' | 'boolean' | 'password' | 'select'

export interface ISenderFieldDef {
    name: string          // property name in ISenderConfig
    label: string         // display label in the UI
    type?: SenderFieldType // defaults to 'text'
    required?: boolean
    options?: string[]    // values for type 'select'
}
```

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
- `subject` is a short headline (useful for email subjects).
- `to` is an optional recipient or list of recipients.
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

Kwirth ships with four senders:

| Sender id | Description |
|---|---|
| `console` | Writes colorized output to `stdout` / `stderr` |
| `file` | Appends to a log file with optional line-count rotation |
| `email-resend` | Sends email via the [Resend](https://resend.com) API |
| `email-smtp` | Sends email via SMTP — TLS, STARTTLS, or plain |

### console

Config reference (`IConsoleSenderConfig`):

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Config identifier |
| `prefix` | `string` | `""` | String prepended to every line |
| `timestamps` | `boolean` | `true` | Include ISO timestamp |
| `levels` | `boolean` | `true` | Include level tag like `[ERROR]` |

### file

Appends formatted lines to a file. Supports line-count-based rotation.

Config reference (`IFileSenderConfig`):

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Config identifier |
| `filePath` | `string` | — | Absolute or relative path to the log file |
| `timestamps` | `boolean` | `true` | Include ISO timestamp |
| `levels` | `boolean` | `true` | Include level tag |
| `maxLines` | `number` | `0` | Rotate after this many lines (0 = no rotation) |

### email-resend

Sends emails using the [Resend](https://resend.com) transactional email API. Requires a Resend account and API key.

Config reference (`IEmailSenderConfig`):

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Config identifier |
| `apiKey` | `string` | ✓ | Resend API key |
| `from` | `string` | — | Sender address (defaults to `kwirth@resend.dev`) |
| `to` | `string \| string[]` | ✓ | Recipient address(es) |
| `subject` | `string` | — | Default subject if not set on the message |

### email-smtp

Sends emails via any SMTP server. Supports three encryption modes.

Config reference (`ISmtpSenderConfig`):

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Config identifier |
| `host` | `string` | ✓ | SMTP server hostname |
| `port` | `number` | ✓ | SMTP port (e.g. 465, 587, 25) |
| `encryption` | `'tls' \| 'starttls' \| 'plain'` | ✓ | `tls` = SMTPS (port 465), `starttls` = STARTTLS (port 587), `plain` = no encryption |
| `user` | `string` | — | SMTP user (omit for unauthenticated relay) |
| `pass` | `string` | — | SMTP password |
| `from` | `string` | ✓ | Sender address |
| `to` | `string \| string[]` | ✓ | Default recipient(s) |
| `subject` | `string` | — | Default subject |

## Managing senders from the UI

Administrators can manage senders directly from the Kwirth frontend without editing any files. Open the menu drawer and choose **Manage senders** (visible only to users with cluster scope).

The dialog follows the same layout as the plugin and provider managers:

- **Installed senders** — cards showing each registered sender with its version, description, source (dev / local / URL), and number of active configs. Click the **+** icon on a card to open an inline config panel.
- **Config panel** — lists all named configs for the selected sender. From here you can add new configs (the form fields are driven by the sender's own `getConfigSchema()` implementation), delete existing ones, and export or import the config set for that sender as a JSON file.
- **Install sender** — installs a new sender from a URL or a local `.tgz` file.
- **Available senders** — catalog fetched from the Kwirth manifest, showing senders available for one-click install.

### Export / Import

Configs can be exported and imported at two levels:

| Scope | Format | Use case |
|---|---|---|
| Per-sender (icons in the config panel) | `ISenderConfig[]` array | Share or back up one sender's configs |
| All senders (buttons in the dialog footer) | `Record<senderId, ISenderConfig[]>` | Full backup / migration |

Sensitive values (API keys, passwords) are included in the export — treat the files accordingly.

## Configuring senders via kwirth-dev.json

For local development, senders and their initial configs can be declared in `kwirth-dev.json`:

```json
{
  "senders": {
    "console":      "../senders/console/dist",
    "file":         "../senders/file/dist",
    "email-resend": "../senders/email-resend/dist",
    "email-smtp":   "../senders/email-smtp/dist"
  },
  "senderConfigs": {
    "email-resend": [
      {
        "name": "default",
        "apiKey": "${RESEND_API_KEY}",
        "from": "kwirth@resend.dev",
        "to": "${RESEND_TO}",
        "subject": "Kwirth notification"
      }
    ]
  }
}
```

Values of the form `${ENV_VAR}` are interpolated from the process environment at startup, keeping secrets out of source control.

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
