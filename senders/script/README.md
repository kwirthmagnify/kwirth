# Script Sender

> 🔴 **This sender runs code.** Every message sent to one of its configurations runs the script written in
> that configuration, **with the identity of the Kwirth back end**: its service account, its file system,
> its network. Only someone who administers senders can write one — treat that permission accordingly.

A sender whose destination is not a service but **a script you write in its configuration**. When the
destination is something Kwirth does not know — an internal API, a vendor CLI, a command — you do not need a
new sender: three lines of shell are enough.

> **Kwirth** is an open-source Kubernetes observability and operations tool: logs, metrics, events and more,
> in real time, extended with plugins like this one. Senders are how Kwirth delivers notifications.
> Website: **https://kwirthmagnify.dev** · Source: **https://github.com/kwirthmagnify/kwirth**

## Installing it

From Kwirth: **☰ → Manage extensions → Senders**, find **Script Sender** and install it. Then create one or
more named configurations for it, and pick them wherever Kwirth asks for a sender.

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | text | — | the configuration name; whoever sends picks the sender by it |
| `interpreter` | select | `sh` | `sh` · `bash` · `pwsh` (PowerShell 7) · `powershell` (Windows PowerShell 5.1) · `cmd` |
| `script` | textarea | — | the script. Can be [drafted by an AI](#let-the-ai-write-it) |
| `stdin` | select | `text` | what the script gets on stdin: `none`, `text` (the message body) or `json` (the whole message) |
| `env` | boolean | `true` | adds the `KWIRTH_*` environment variables |
| `wait` | boolean | `true` | wait for the script to finish; off = the delivery returns as soon as it starts (see below) |
| `timeoutSeconds` | number | `30` | the script — and everything it started — is killed when it runs longer |

## What the script receives

It gets **no arguments**. The message arrives the way the configuration says — both ways at once if you
want:

- **stdin = `text`** — the message body, verbatim. It can be any text: the description of an alarm, a log
  line.
- **stdin = `json`** — the whole message:
  `{"subject"?, "body", "to"?, "level"?, "metadata"?, "origin"?: {cluster, namespace, pod, container, service, source, timestamp}}`.
- **env = on** — `KWIRTH_BODY`, `KWIRTH_SUBJECT`, `KWIRTH_LEVEL`, `KWIRTH_TO` (comma-separated) and
  `KWIRTH_MESSAGE` (the message as JSON).

**Batches** (a log forwarder hands over many lines at once) are **one run**, not one per message: `text`
gives one body per line, `json` gives an **array**, and the environment only has `KWIRTH_BODY` (one body per
line) and `KWIRTH_MESSAGE` (the array).

## Success and failure

Exit code **0** is a successful delivery; the result carries `exitCode`, `stdout` and `stderr` (their last
8 KB). Any other exit code, or running past the timeout, **fails the delivery** with the code and the end of
what the script wrote to stderr — so write your errors there. Try a configuration with the **Sender Debug**
plugin before you connect it to anything real: it shows exactly that result or error.

## Not waiting for the script

With **`wait` off** the delivery returns as soon as the script has **started**, with `{ started: true, pid }`,
and whoever sent does not wait for it. What can be known at that moment still fails the delivery (an
interpreter the host does not have); what happens afterwards — an exit code other than 0, the timeout — only
reaches **the sender's log**, because there is nobody left to tell. The timeout still kills the script, and
stopping the sender kills whatever is still running.

At most **20 runs of one configuration** can be going on in the background at once: past that, the delivery
fails saying so, so that a storm of alarms cannot fill the back end's pod with processes.

## The environment is clean — on purpose

The back end's environment holds credentials (database, tokens, master key). The script **does not inherit
it**: it starts with `PATH`, `HOME`, `LANG`, `LC_ALL`, `TZ` and `TMPDIR` (on Windows, `PATH`, `PATHEXT`,
`SYSTEMROOT`, `WINDIR`, `COMSPEC`, `TEMP`, `TMP`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `PROGRAMDATA`,
`PROGRAMFILES` and a few system ones), plus the `KWIRTH_*` variables. A script that expects a variable of
the container will not find it.

## Which interpreters are there

It depends on **where Kwirth runs**:

- **Kwirth's official container image** (Alpine): only **`sh`** — BusyBox's POSIX shell — with BusyBox
  tools. **`wget` is there; `curl`, `bash`, `jq` and `pwsh` are not.**
- **Kwirth on Windows**: `cmd` and `powershell` always; `pwsh` if PowerShell 7 is installed.
- **Kwirth on another Linux or macOS**: whatever that host has.

Choosing an interpreter the host does not have fails the delivery saying so.

With `cmd`, read the text of the message from **stdin** rather than from `%KWIRTH_BODY%`: cmd expands
`%`, `^`, `&` and `|` inside variables, so free text can break the line it is used in.

## Examples

POST the alarm text to a webhook — in the official image (`sh`, `wget`):

```sh
#!/bin/sh
# stdin = text
wget -q -O- --header='Content-Type: text/plain' --post-data="$(cat)" https://hooks.example/alarm
```

Only act on errors, with the whole message (`sh`, stdin = `none`, env = on):

```sh
#!/bin/sh
[ "$KWIRTH_LEVEL" = "error" ] || exit 0
echo "$(date -u +%FT%TZ) $KWIRTH_SUBJECT: $KWIRTH_BODY" >> /tmp/kwirth-errors.log
```

Windows, PowerShell (stdin = `json`):

```powershell
$m = $input | Out-String | ConvertFrom-Json
Invoke-RestMethod -Method Post -Uri https://hooks.example/alarm -ContentType 'application/json' `
    -Body (@{ text = "$($m.subject): $($m.body)"; level = $m.level } | ConvertTo-Json)
```

## Let the AI write it

When Kwirth has an LLM configured, the **script** field has an AI button: describe what you want in plain
words — *"when an alarm arrives, POST its text to https://hooks.example/alarm"* — and it drafts the script
for the interpreter you selected. **The AI only writes the text**: it runs nothing, and what it writes lands
in the field unsaved. Read it before you save it: an LLM can be wrong, and this text is going to run.

## Development

```
npm install
npm run watch          # rebuilds dist/back.js on every change
npm test               # the tests run real sh/bash scripts (cmd/PowerShell ones on Windows)
COVERAGE=1 npm test    # with coverage
```

Register it in the core's `back/kwirth-dev.json` so the core loads it in dev, and restart the back after
a change:

```json
"senders": {
    "script": "../senders/script/dist"
}
```

## Publishing

```
npm run build
cd dist
npm publish --access=public
```

The build copies this README into `dist/`: it is what npm shows for the package.
