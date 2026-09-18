# email-smtp

Sends emails via any SMTP server. Supports three encryption modes.

Config reference (`ISmtpSenderConfig`):

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Config identifier |
| `host` | `string` | ✓ | SMTP server hostname |
| `port` | `number` | ✓ | SMTP port (e.g. 465, 587, 25) |
| `encryption` | `'tls' \| 'starttls' \| 'plain'` | ✓ | `tls` = SMTPS (port 465), `starttls` = STARTTLS (port 587), `plain` = no encryption |
| `user` | `string` | — | SMTP user (omit for unauthenticated relay) |
| `pass` | `string` | — | SMTP password |
| `from` | `string` | ✓ | Sender address |
| `to` | `string \| string[]` | ✓ | Default recipient(s) |
| `subject` | `string` | — | Default subject |
