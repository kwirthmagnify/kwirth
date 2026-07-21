# teams

Posts messages to a **Microsoft Teams** channel using an [incoming webhook](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook). Messages are formatted as Adaptive MessageCards with colour-coding by severity level.

Config reference (`ITeamsSenderConfig`):

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Config identifier |
| `webhookUrl` | `string` | ✓ | Incoming webhook URL from the Teams channel connector |
| `title` | `string` | — | Default card title when the message has no `subject` |

Colour mapping by `ISenderMessage.level`:

| Level | Colour |
|---|---|
| `error` | Red `#FF0000` |
| `warning` | Orange `#FFA500` |
| `info` | Teams blue `#0078D4` |
| `debug` | Gray `#808080` |
| _(none)_ | Teams blue `#0078D4` |

Example config:

```json
{
  "name": "ops-channel",
  "webhookUrl": "https://your-org.webhook.office.com/webhookb2/...",
  "title": "Kwirth alert"
}
```
