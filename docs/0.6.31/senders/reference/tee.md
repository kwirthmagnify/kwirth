# tee

The `tee` sender fans a single message out to **multiple target senders simultaneously**. All targets receive the same message; the sender does not modify it. If any individual target fails the rest still receive the message.

Config reference (`ITeeSenderConfig`):

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Config identifier |
| `targets` | `{ senderId: string; configName: string }[]` | ✓ | List of (sender, config) pairs to forward to |

Example — broadcast an alert to both the console and an SMTP inbox:

```json
{
  "name": "broadcast",
  "targets": [
    { "senderId": "console", "configName": "default" },
    { "senderId": "email-smtp", "configName": "alerts" }
  ]
}
```

From a channel:

```typescript
await bco.senders?.send('tee', 'broadcast', { level: 'error', subject: 'Crash', body: '...' })
```
