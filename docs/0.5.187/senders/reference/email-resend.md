# email-resend

Sends emails using the [Resend](https://resend.com) transactional email API. Requires a Resend account and API key.

Config reference (`IEmailSenderConfig`):

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Config identifier |
| `apiKey` | `string` | ✓ | Resend API key |
| `from` | `string` | — | Sender address (defaults to `kwirth@resend.dev`) |
| `to` | `string \| string[]` | ✓ | Recipient address(es) |
| `subject` | `string` | — | Default subject if not set on the message |
