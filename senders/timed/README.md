# sender-timed

Routes or drops messages based on **time-of-day windows** and optional **day-of-week** filters. Rules are evaluated in order — first match wins. If no rule matches, the `defaultAction` applies.

## Use cases

- Only forward alerts to on-call during business hours
- Drop non-critical notifications at night
- Route differently on weekends vs weekdays

## Config fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | ✓ | Config name |
| `timezone` | string | | IANA timezone (e.g. `Europe/Madrid`). Defaults to server local time. |
| `rules` | JSON array | | Ordered list of `ITimedSenderRule` (see below) |
| `defaultAction` | `send`\|`drop` | | Action when no rule matches (default: `drop`) |
| `defaultSenderId` | string | | Sender to use for default `send` |
| `defaultConfigName` | string | | Config name for default `send` |

## Rule fields (`ITimedSenderRule`)

| Field | Type | Required | Description |
|---|---|---|---|
| `from` | `"HH:mm"` | ✓ | Start of window (inclusive, 24h) |
| `to` | `"HH:mm"` | ✓ | End of window (exclusive, 24h). If `to < from`, the window spans midnight. |
| `days` | `number[]` | | Days of week: 0=Sun, 1=Mon … 6=Sat. All days if omitted. |
| `action` | `send`\|`drop` | ✓ | What to do on match |
| `senderId` | string | | Required when `action === "send"` |
| `configName` | string | | Required when `action === "send"` |

## Examples

### Business hours only (Mon–Fri 09:00–18:00 → email, otherwise drop)

```json
{
  "name": "biz-hours",
  "timezone": "Europe/Madrid",
  "rules": [
    {
      "from": "09:00", "to": "18:00",
      "days": [1,2,3,4,5],
      "action": "send",
      "senderId": "email-smtp", "configName": "ops-team"
    }
  ],
  "defaultAction": "drop"
}
```

### Night silence (22:00–08:00 → drop, rest → send)

```json
{
  "name": "no-nights",
  "rules": [
    { "from": "22:00", "to": "08:00", "action": "drop" }
  ],
  "defaultAction": "send",
  "defaultSenderId": "console", "defaultConfigName": "default"
}
```

### Weekend routing (Sat+Sun → Slack, weekdays → email)

```json
{
  "name": "weekend-routing",
  "rules": [
    {
      "from": "00:00", "to": "00:00",
      "days": [0, 6],
      "action": "send",
      "senderId": "slack", "configName": "oncall"
    }
  ],
  "defaultAction": "send",
  "defaultSenderId": "email-smtp", "defaultConfigName": "team"
}
```

> **Note:** A window where `from === to` (e.g. `"00:00"` to `"00:00"`) matches **all times** of the specified days.
