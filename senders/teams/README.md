# MS Teams Sender

Kwirth sender that delivers notifications to a Microsoft Teams channel through an **incoming webhook**.
Each message is posted as a `MessageCard` whose colour follows the message level (error, warning, info,
debug).

Part of [Kwirth](https://kwirthmagnify.dev) — real-time Kubernetes observability
([source](https://github.com/kwirthmagnify/kwirth)).

## Install

From the Kwirth extension manager, or directly:

```
https://registry.npmjs.org/@kwirthmagnify/kwirth-sender-teams/-/kwirth-sender-teams-<version>.tgz
```

It needs no core restart.

## Configuration

| Field        | Required | Description                                                   |
|--------------|----------|---------------------------------------------------------------|
| `name`       | yes      | Name of this configuration                                    |
| `webhookUrl` | yes      | Incoming webhook URL of the Teams channel                     |
| `title`      | no       | Default card title, used when the message carries no subject  |

The card title is the message subject, or `title` if there is none. A non-2xx answer from the webhook is
reported as an error.

## Building

```
npm install
npm run build      # typechecks and writes dist/
```

The build produces `dist/`, which is what gets published.
