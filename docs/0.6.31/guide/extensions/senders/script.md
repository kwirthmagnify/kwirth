# script (sender)

> **Type:** Sender<br>
> **Package:** `@kwirthmagnify/kwirth-sender-script`

> 🔴 **This sender runs code.** Every message sent to one of its configurations runs the script written in
> that configuration **with the identity of the kwirth backend** — its service account, its file system,
> its network. Only someone who administers senders can write one.

## What it does

The **script** sender's destination is not a service but **a script you write in its configuration**.
When a message has to go somewhere kwirth has no sender for — an internal API, a vendor CLI, a command that
reacts to an alarm — you write three lines of shell instead of waiting for a new sender.

Each message runs the script once; a **batch** (log forwarding hands over many lines at once) runs it
**once for the whole batch**, never once per line.

## Configuration

| Field | Type | What it does |
|---|---|---|
| **Name** * | text | Config name (`script::<name>`). |
| **Description** | text | Free-text note. |
| **Interpreter** * | select | `sh`, `bash`, `pwsh` (PowerShell 7), `powershell` (Windows PowerShell 5.1) or `cmd`. **sh** by default. See [which interpreters are there](#which-interpreters-are-there). |
| **Script** * | multi-line | The script. Line breaks, tabs and backslashes are kept exactly as you type them. The 🤖 button lets an LLM [draft it for you](../ai-assist). |
| **Standard input** | select | What the script gets on stdin: **Nothing**, **The message body as text** (default) or **The whole message as JSON**. |
| **KWIRTH_\* environment variables** | toggle | Adds the message as environment variables. **On** by default. |
| **Wait for the script to finish** | toggle | **On** by default: the delivery waits for the script and its result. Off: the delivery returns as soon as the script starts — see [not waiting](#not-waiting-for-the-script). |
| **Timeout (seconds)** | number | The script — **and everything it started** — is killed when it runs longer. **30** by default. |

## What the script receives

It gets **no arguments**. The message arrives the way the configuration says, both ways at once if you
want:

| | one message | a batch |
|---|---|---|
| stdin = **text** | the body, verbatim — any text, such as the description of an alarm | one body per line |
| stdin = **JSON** | `{"subject", "body", "to", "level", "metadata", "origin"}` | an **array** of them |
| `KWIRTH_BODY` | the body | one body per line |
| `KWIRTH_SUBJECT`, `KWIRTH_LEVEL`, `KWIRTH_TO` | subject, level (`debug`/`info`/`warning`/`error`), recipients comma-separated | *not set* — a batch has no single subject |
| `KWIRTH_MESSAGE` | the message as JSON | the array as JSON |

## Success and failure

- **Exit code 0** — delivered. The result carries the exit code and the **last 8 KB** of stdout and
  stderr.
- **Any other exit code**, or **running past the timeout** — the delivery **fails**, and the error says the
  code and the end of what the script wrote to **stderr**. Write your error messages there.
- An interpreter the host does not have fails with *"the interpreter 'bash' is not available on this
  host"*.

**Try every configuration with [Sender Debug](../plugins/sender-debug) before you connect it to anything
real**: compose a message, send it, and you see exactly the result or the error.

## Not waiting for the script

Turn **Wait for the script to finish** off when whoever sends should not be held up by the script — a slow
call, a long job:

- The delivery returns as soon as the script has **started**, answering `{ started: true, pid }`.
- What can be known at that moment still **fails** the delivery: an interpreter the host does not have.
- What happens afterwards — an exit code other than 0, the timeout — only reaches **the sender's log**
  (kwirth's log, component of the sender). Whoever sent is not told: that is what not waiting means.
- The **timeout still applies**, and stopping the sender (uninstalling it, restarting kwirth) kills
  whatever is still running.
- At most **20 runs of one configuration** can be going on at once. Past that the delivery fails with
  *"20 runs of this script are still going in the background"*, so a storm of alarms cannot fill the pod
  with processes.

## The environment is clean — on purpose

The backend's environment holds credentials: the database password, tokens, the master key. **The script
does not inherit it.** It starts with `PATH`, `HOME`, `LANG`, `LC_ALL`, `TZ` and `TMPDIR` — on Windows,
`PATH`, `PATHEXT`, `SYSTEMROOT`, `WINDIR`, `COMSPEC`, `TEMP`, `TMP`, `USERPROFILE`, `APPDATA`,
`LOCALAPPDATA`, `PROGRAMDATA`, `PROGRAMFILES` and a few system ones — plus the `KWIRTH_*` variables. A
script that expects a variable of the container will not find it.

## Which interpreters are there

It depends on **where kwirth runs**, not on the sender:

- **kwirth's official container image** (Alpine): only **`sh`** — BusyBox's POSIX shell — with BusyBox
  tools. **`wget` is there; `curl`, `bash`, `jq` and `pwsh` are not.** Write POSIX `sh`.
- **kwirth on Windows**: `cmd` and `powershell` always; `pwsh` if PowerShell 7 is installed.
- **kwirth on another Linux or macOS**: whatever that host has installed.

> With **cmd**, read the text of the message from **stdin** rather than from `%KWIRTH_BODY%`: cmd expands
> `%`, `^`, `&` and `|` inside variables, so free text can break the line it is used in.

## Examples

**POST the alarm text to a webhook** — in the official image (`sh` + `wget`, stdin = text):

```sh
#!/bin/sh
wget -q -O- --header='Content-Type: text/plain' --post-data="$(cat)" https://hooks.example/alarm
```

**Only act on errors** (`sh`, stdin = nothing, environment variables on):

```sh
#!/bin/sh
[ "$KWIRTH_LEVEL" = "error" ] || exit 0
echo "$(date -u +%FT%TZ) $KWIRTH_SUBJECT: $KWIRTH_BODY" >> /tmp/kwirth-errors.log
```

**Windows, PowerShell** (stdin = JSON):

```powershell
$m = $input | Out-String | ConvertFrom-Json
Invoke-RestMethod -Method Post -Uri https://hooks.example/alarm -ContentType 'application/json' `
    -Body (@{ text = "$($m.subject): $($m.body)"; level = $m.level } | ConvertTo-Json)
```

## Let the AI write it

With an LLM configured in kwirth, the **Script** field has a 🤖 button: describe what you want —
*"when an alarm arrives, POST its text to https://hooks.example/alarm"* — and it drafts the script for the
interpreter you selected, knowing what this sender passes on stdin and in the environment, and that the
official image has `wget` but no `curl`. **The AI only writes the text**: it runs nothing, and the script
lands in the field **unsaved**. Read it before you press Save — an LLM can be wrong, and this text is going
to run. See [Generate a field with AI](../ai-assist).

## Notes

- Combine with **[regex](regex)** to run the script only for the messages that match, or with
  **[tee](tee)** to run it **and** notify elsewhere.
- Running a script **on another machine** (SSH, Linux or Windows) is coming in a later version.
