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
- `getConfigSchema()` — **optional**. Returns the list of fields that define a config for this sender. When implemented, the Kwirth management UI uses this schema to render a type-safe form for adding new configs, so no frontend code needs to know the config structure.
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
