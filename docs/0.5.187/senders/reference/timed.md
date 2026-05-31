# timed

The `timed` sender gates message delivery by **time-of-day and day-of-week**. Each config holds a list of time-window rules and a default action for messages that fall outside all defined windows. This is useful for silencing non-critical alerts at night or on weekends, or for routing to on-call inboxes only during business hours.

**UI interaction**: The timed sender also has a custom frontend. Expanding its card in Manage Senders opens a **Rule Editor** where you can create, edit, and reorder time windows without editing JSON.

Config reference:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Config identifier |
| `timezone` | `string` | ✓ | IANA timezone (e.g. `"Europe/Madrid"`) — all times are interpreted in this zone |
| `rules` | `ITimedRule[]` | ✓ | Ordered list of time-window rules |
| `defaultAction` | `'drop' \| 'send'` | — | Action for messages outside all windows (default: `'drop'`) |
| `defaultSenderId` | `string` | — | Target sender for default `'send'` action |
| `defaultConfigName` | `string` | — | Target config for default `'send'` action |

Each rule (`ITimedRule`):

| Field | Type | Required | Description |
|---|---|---|---|
| `from` | `string` | ✓ | Window start in `HH:MM` 24-hour format |
| `to` | `string` | ✓ | Window end in `HH:MM` 24-hour format |
| `days` | `number[]` | ✓ | Days of the week (0 = Sunday … 6 = Saturday) |
| `action` | `'drop' \| 'send'` | ✓ | What to do when the current time falls in this window |
| `senderId` | `string` | — | Target sender (only when `action = 'send'`) |
| `configName` | `string` | — | Target config (only when `action = 'send'`) |

Example — forward to SMTP during business hours (Mon–Fri 08:00–18:00), drop everything else:

```json
{
  "name": "business-hours",
  "timezone": "Europe/Madrid",
  "rules": [
    {
      "from": "08:00",
      "to": "18:00",
      "days": [1, 2, 3, 4, 5],
      "action": "send",
      "senderId": "email-smtp",
      "configName": "alerts"
    }
  ],
  "defaultAction": "drop"
}
```

Example — route to on-call email during nights and weekends:

```json
{
  "name": "on-call-routing",
  "timezone": "America/New_York",
  "rules": [
    {
      "from": "09:00",
      "to": "18:00",
      "days": [1, 2, 3, 4, 5],
      "action": "send",
      "senderId": "email-smtp",
      "configName": "team-inbox"
    },
    {
      "from": "00:00",
      "to": "23:59",
      "days": [0, 6],
      "action": "send",
      "senderId": "email-smtp",
      "configName": "on-call"
    }
  ],
  "defaultAction": "send",
  "defaultSenderId": "email-smtp",
  "defaultConfigName": "on-call"
}
```
