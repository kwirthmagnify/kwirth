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

---

## Built-in daemons

### censor

The **Censor daemon** is the headless version of the [Censor plugin](./plugins?id=censor). It performs exactly the same LLM-based log noise filtering but runs continuously in the background without any user interaction. This is useful for production deployments where you want permanent log filtering and alerting without keeping a browser tab open.

**How it works:**

1. The daemon watches selected containers (configured via the Kwirth API or the Censor plugin UI when the `sync-daemon` option is on).
2. Log lines from watched containers are streamed through a `PassThrough` pipe into a per-instance line buffer.
3. When the buffer reaches `batchSize`, the batch is sent to the configured LLM with a structured-output prompt.
4. The LLM returns a JSON array of regular-expression patterns that match noisy lines.
5. Patterns are compiled and cached; all future lines from that instance are tested against them before forwarding.
6. Matching (noisy) lines are dropped; non-matching lines are forwarded to the configured sender (if any).

**Instance config (`ICensorInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Config name |
| `llmId` | `string` | — | ID of the LLM to use (from the shared LLM list) |
| `system` | `string` | _(built-in)_ | System prompt sent to the LLM |
| `batchSize` | `number` | `50` | Lines to accumulate before an LLM call |
| `exampleJson` | `string` | `{"patterns":[""]}` | Expected output schema — drives structured generation |
| `temperature` | `number` | `0.2` | LLM temperature |
| `active` | `boolean` | `false` | Whether filtering is active immediately on start |
| `space` | `string` | — | Business provider space to subscribe to |
| `type` | `string` | — | Business event type within that space |
| `addTimestamp` | `boolean` | `false` | Prepend ISO timestamp to each log line before analysis |
| `businessPath` | `string` | — | Dot-notation path to extract text from a business event payload |
| `senderId` | `string` | — | Sender to use for forwarding non-noisy lines or alerts |
| `senderConfigName` | `string` | — | Config name for the above sender |

**Management commands (`ECensorDaemonCommand`):**

| Command | Description |
|---|---|
| `configget` | Get all stored instance configs |
| `configset` | Add or update an instance config |
| `configsave` | Persist the current config to storage |
| `configdelete` | Delete an instance config by name |
| `providersavailable` | List LLM providers available in this build |
| `providersget` | Get the current LLM provider list |
| `providersset` | Set the LLM provider list |
| `analyzestart` | Start the analysis loop for an instance |
| `analyzestop` | Stop the analysis loop for an instance |
| `regexdelete` | Remove a cached regex pattern from an instance |
| `statsget` | Get processing statistics (processed, LLM calls, tokens in/out) |
| `regexget` | Get the current regex pattern list for an instance |
| `analyzestate` | Get the current `analyzing` flag for an instance |

**Requirements:**

| Requirement | Value |
|---|---|
| Storage | Yes — persists configs and LLM provider settings |
| Providers | `events`, `business` |

**Supported LLM providers:** `google`, `openai`, `openrouter`, `mistral`, `groq`, `deepseek`

?> The Censor daemon shares its config storage key with the Censor plugin. If both are running, they operate independently but read from the same persisted config — meaning configs created in the plugin UI are immediately visible to the daemon.

---

## Developing your own daemon

1. Create a new package under `daemons/<your-daemon>/`.
2. Add `@kwirthmagnify/kwirth-common-back` as a dependency.
3. Implement the `IDaemon` interface and export the class as the default export.
4. Build to a single CJS bundle as `dist/back.js` (with `dist/package.json` containing `id`, `name`, `version`, `description`).

Minimal scaffold:

```typescript
import { IDaemon, IBackDaemonObject, IDaemonInstanceConfig, BackDaemonData } from '@kwirthmagnify/kwirth-common-back'

export class MyDaemon implements IDaemon {
    readonly daemonId = 'my-daemon'

    constructor(private clusterInfo: unknown, private bdo: IBackDaemonObject) {}

    getDaemonData(): BackDaemonData {
        return { id: 'my-daemon' }
    }

    async startDaemon(): Promise<void> {
        this.bdo.logInfo?.('[my-daemon] started')
    }

    containsInstance(id: string): boolean { return false }
    containsAsset(id: string, ns: string, pod: string, c: string): boolean { return false }

    async addObject(cfg: IDaemonInstanceConfig, ns: string, pod: string, c: string): Promise<boolean> {
        return true
    }

    async deleteObject(cfg: IDaemonInstanceConfig, ns: string, pod: string, c: string): Promise<boolean> {
        return true
    }

    async processCommand(instanceId: string, command: string, data?: unknown): Promise<unknown> {
        return null
    }
}

export default MyDaemon
```

### Hot-reload for development

Add the daemon to `kwirth-dev.json`:

```json
{
  "daemons": {
    "my-daemon": "../daemons/my-daemon/dist"
  }
}
```

Kwirth watches `dist/back.js` and hot-reloads the daemon whenever the file changes.
