# Managing senders

## Managing senders from the UI

Administrators can manage senders directly from the Kwirth frontend without editing any files. Open the menu drawer and choose **Manage senders** (visible only to users with cluster scope).

The dialog follows the same layout as the plugin and provider managers:

- **Installed senders** — cards showing each registered sender with its version, description, source (dev / local / URL), and number of active configs. Click the **+** icon on a card to open an inline config panel.
- **Config panel** — lists all named configs for the selected sender. From here you can add new configs (the form fields are driven by the sender's own `getConfigSchema()` implementation), delete existing ones, and export or import the config set for that sender as a JSON file.
- **Install sender** — installs a new sender from a URL or a local `.tgz` file.
- **Available senders** — catalog fetched from the Kwirth manifest, showing senders available for one-click install.

### Export / Import

Configs can be exported and imported at two levels:

| Scope | Format | Use case |
|---|---|---|
| Per-sender (icons in the config panel) | `ISenderConfig[]` array | Share or back up one sender's configs |
| All senders (buttons in the dialog footer) | `Record<senderId, ISenderConfig[]>` | Full backup / migration |

Sensitive values (API keys, passwords) are included in the export — treat the files accordingly.

## Configuring senders via kwirth-dev.json

For local development, senders and their initial configs can be declared in `kwirth-dev.json`:

```json
{
  "senders": {
    "console":      "../senders/console/dist",
    "file":         "../senders/file/dist",
    "email-resend": "../senders/email-resend/dist",
    "email-smtp":   "../senders/email-smtp/dist"
  },
  "senderConfigs": {
    "email-resend": [
      {
        "name": "default",
        "apiKey": "${RESEND_API_KEY}",
        "from": "kwirth@resend.dev",
        "to": "${RESEND_TO}",
        "subject": "Kwirth notification"
      }
    ]
  }
}
```

Values of the form `${ENV_VAR}` are interpolated from the process environment at startup, keeping secrets out of source control.
