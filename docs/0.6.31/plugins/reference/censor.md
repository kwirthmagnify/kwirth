# Censor

The **Censor** plugin intercepts log streams from selected containers and runs them through an LLM to identify and filter out noise. It builds a growing set of regular expressions from the LLM analysis and applies them in-process to avoid sending every log line to the LLM.

**How it works:**

1. Log lines are accumulated in a buffer (configurable batch size).
2. When the buffer reaches `batchSize`, the batch is sent to the configured LLM with a system prompt asking it to return noise-matching regular expressions.
3. Newly learned regexes are added to the local filter list and applied to all subsequent lines.
4. Filtered lines, raw lines, LLM input/output, and stats (tokens in/out, processed/pending counts) are all streamed back to the frontend tab.

**Instance config (`ICensorInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Config name |
| `llmId` | `string` | — | ID of the LLM to use (from the shared LLM list) |
| `system` | `string` | _(built-in)_ | System prompt sent to the LLM |
| `batchSize` | `number` | `50` | Lines to accumulate before triggering an LLM call |
| `exampleJson` | `string` | `{"patterns":[""]}` | Expected JSON output schema — drives structured output |
| `temperature` | `number` | `0.2` | LLM temperature |
| `active` | `boolean` | `false` | Whether filtering is active on start |
| `senderId` | `string` | — | Sender to use for alerts |
| `senderConfigName` | `string` | — | Config name for the sender above |

The plugin also supports **sessions**: a session captures the live log stream from a specific container into a named session object that can be connected and disconnected independently.

The Censor plugin requires the **events** and **business** providers to be active.
