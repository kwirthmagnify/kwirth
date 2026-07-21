# Ops

The **Ops** plugin provides day-to-day operational capabilities directly inside Kwirth: interactive shell sessions, pod and namespace restarts, and object inspection — all without leaving the browser.

**Setup options:**

| Field | Description |
|---|---|
| Keep-alive | Kwirth sends periodic keep-alive signals to shell sessions so they survive long periods of inactivity. Combined with Kwirth's reconnect support, sessions survive WebSocket drops too. |
| Function access key | Modifier key that must be held while pressing F1–F12 to switch between shell sessions. Options: `Disabled` (F-key switching off), `None` (no modifier), `Alt`, `Control`, `Shift`. |

**Available operations** (triggered from the UI — no typed command bar):

| Operation | Scope required | Description |
|---|---|---|
| Describe | `ops$get` | Full Kubernetes describe output for a resource |
| Execute | `ops$execute` | Run a single shell command inside a container |
| Restart container | `ops$restart` | Restart a specific container (via `killall5`) |
| Restart pod | `ops$restart` | Restart a pod |
| Restart namespace | `ops$restart` | Restart all workloads in a namespace |

**Interactive shell (XTerm):**

Opening a shell starts a full TTY (`/bin/sh`) inside the target container. Multiple sessions can run simultaneously and are assigned to function keys for instant switching:

| Key | Action |
|---|---|
| F1–F10 | Switch directly to shell session 1–10 |
| F11 | Show the session list picker |
| F12 | Return to the Ops view (sessions stay alive) |
| Ctrl-D / `exit` | End the current session |

The Ops plugin requires cluster-scope access to restart namespaces. For read-only operations (`describe`) a lower-privilege key is sufficient.
