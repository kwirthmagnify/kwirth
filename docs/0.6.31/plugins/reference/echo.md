# Echo

The **Echo** plugin is the official reference implementation. It periodically sends a configurable test message for every watched resource, which makes it ideal for verifying connectivity, testing sender pipelines, or learning how to build a plugin.

**Instance config (`IEchoInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `interval` | `number` | `5` | Seconds between messages |
| `senderId` | `string` | — | Optional sender to notify on start |
| `senderConfigName` | `string` | — | Config name for the sender above |

**Channel config (`IEchoConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `maxLines` | `number` | `3` | Maximum lines kept in the tab view |

The Echo plugin also subscribes to the **OTel provider** — if an OpenTelemetry provider is active, Echo forwards incoming traces, metrics, and logs to all running instances.
