# regex

The `regex` sender evaluates an ordered list of **regular-expression rules** against each incoming message. The first matching rule wins. A rule can either **drop** the message (useful for silencing noise) or **forward** it to another sender.

Rules are evaluated against the message `subject`, `body`, or both (configurable per-config).

Config reference:

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Config identifier |
| `rules` | `IRegexRule[]` | ✓ | Ordered list of regex rules |
| `defaultAction` | `'drop' \| 'send'` | — | Action when no rule matches (default: `'send'`) |
| `defaultSenderId` | `string` | — | Target sender when default action is `'send'` |
| `defaultConfigName` | `string` | — | Target config when default action is `'send'` |

Each rule (`IRegexRule`):

| Field | Type | Required | Description |
|---|---|---|---|
| `pattern` | `string` | ✓ | JavaScript regular expression (tested via `new RegExp(pattern)`) |
| `action` | `'drop' \| 'send'` | ✓ | What to do when the pattern matches |
| `senderId` | `string` | — | Target sender (only used when `action = 'send'`) |
| `configName` | `string` | — | Target config (only used when `action = 'send'`) |

Example — drop development noise, forward critical messages by email:

```json
{
  "name": "prod-filter",
  "rules": [
    { "pattern": "\\[DEV\\]",  "action": "drop" },
    { "pattern": "CRITICAL|FATAL", "action": "send", "senderId": "email-smtp", "configName": "on-call" }
  ],
  "defaultAction": "send",
  "defaultSenderId": "console",
  "defaultConfigName": "default"
}
```
