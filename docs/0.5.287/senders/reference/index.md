# Sender reference

Kwirth ships with eight senders split into two categories.

**Leaf senders** — deliver a message to an external destination:

| Sender id | Description |
|---|---|
| `console` | Writes colorized output to `stdout` / `stderr` |
| `file` | Appends to a log file with optional line-count rotation |
| `email-resend` | Sends email via the [Resend](https://resend.com) API |
| `email-smtp` | Sends email via SMTP — TLS, STARTTLS, or plain |
| `teams` | Posts a message card to a Microsoft Teams channel via incoming webhook |

**Routing senders** — intercept and route messages to other senders:

| Sender id | Description |
|---|---|
| `tee` | Fans a message out to multiple configured targets simultaneously |
| `regex` | Filters or routes messages based on ordered regular-expression rules |
| `composite` | Visual pipeline editor combining `tee` and `regex` nodes into a routing tree |
| `timed` | Time-window gating — forwards or drops messages based on time-of-day and day-of-week rules |
