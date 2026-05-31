# Censor daemon

The **Censor daemon** is the headless version of the [Censor plugin](../../channels/censor). It performs exactly the same LLM-based log noise filtering but runs continuously in the background without any user interaction. This is useful for production deployments where you want permanent log filtering and alerting without keeping a browser tab open.

## How it works

1. The daemon watches selected containers (configured via the Kwirth API or the Censor plugin UI when the `sync-daemon` option is on).
2. Log lines from watched containers are streamed through a `PassThrough` pipe into a per-instance line buffer.
3. When the buffer reaches `batchSize`, the batch is sent to the configured LLM with a structured-output prompt.
4. The LLM returns a JSON array of regular-expression patterns that match noisy lines.
5. Patterns are compiled and cached; all future lines from that instance are tested against them before forwarding.
6. Matching (noisy) lines are dropped; non-matching lines are forwarded to the configured sender (if any).

## Instance config (`ICensorInstanceConfig`)

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

## Management commands (`ECensorDaemonCommand`)

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

## Requirements

| Requirement | Value |
|---|---|
| Storage | Yes — persists configs and LLM provider settings |
| Providers | `events`, `business` |

**Supported LLM providers:** `google`, `openai`, `openrouter`, `mistral`, `groq`, `deepseek`

?> The Censor daemon shares its config storage key with the Censor plugin. If both are running, they operate independently but read from the same persisted config — meaning configs created in the plugin UI are immediately visible to the daemon.
