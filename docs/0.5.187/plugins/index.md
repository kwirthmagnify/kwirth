# Plugins

Starting with Kwirth 0.4, the channel system has been formalized as a **plugin architecture**. A plugin is a self-contained unit of functionality that extends Kwirth with a new capability — exactly the way [Backstage plugins](https://backstage.io/plugins) work.

In practice, every channel you use in Kwirth (Log, Metrics, Alert, Trivy, Ops, Fileman, Magnify, Pinocchio...) is in fact a plugin. Kwirth ships with a set of built-in plugins, and you can add external ones or build your own.

## How plugins work

A plugin is always made of two coordinated pieces:

| Part | Where it runs | What it does |
|---|---|---|
| **Back plugin** | Kwirth backend (Node.js) | Receives WebSocket/HTTP requests from clients, interacts with Kubernetes |
| **Front plugin** | Kwirth frontend (React) | Renders the UI, handles user interaction, communicates with the back plugin |

Both parts share the same `channelId` string (e.g., `"log"`, `"metrics"`, `"trivy"`). Kwirth core uses this id to route messages between the front and back sides of the same plugin.

The communication between front and back plugin travels over the **Kwirth WebSocket** — the same persistent connection that Kwirth uses for all real-time data streaming. A single WebSocket can carry multiple plugin instances simultaneously.

![plugin architecture](../_media/kwirth-kwirth-channels.png ':class=imageclass80')

## Plugin lifecycle

When a user opens a new tab in Kwirth and selects a resource, the following sequence takes place:

1. **initChannel** — front plugin is notified a new tab has been created.
2. User configures the plugin (setup dialog) and clicks **START**.
3. **startChannel** — front plugin sends a `start` instance message to the back plugin over the WebSocket.
4. Back plugin starts processing data (log stream, metrics scrape, vulnerability scan, etc.) and pushes results back.
5. **processChannelMessage** — front plugin receives each message and updates its React component.
6. User can **PAUSE** / **CONTINUE** / **STOP** the plugin at any time.
7. If the WebSocket drops, Kwirth will attempt to reconnect. Back plugins that support reconnect will resume the instance on the new socket automatically.

?> Not all plugins support every lifecycle action. A plugin declares its capabilities via `getChannelData()` (back) and the `requirements` object (front).

## Plugin instances

A key concept is the **instance**: a plugin instance is an independent streaming session with its own configuration. Multiple instances of the same plugin (or different plugins) can run simultaneously over the same WebSocket connection.

For example, you can have three Log plugin instances open at the same time — one for namespace `default`, one for `kube-system`, and one for a specific pod — all sharing one WebSocket to the backend.

## Built-in channels

Two channels are compiled directly into the Kwirth binary and always available:

| Channel id | Description | Docs |
|---|---|---|
| `metrics` | Real-time CPU / memory / I/O metrics (no Prometheus needed) | [Channels → Metrics](../channels?id=metrics) |
| `magnify` | Full Kubernetes management tool (replaces Lens / K9s / Headlamp) | [Channels → Magnify](../channels?id=magnify) |

## Available plugins

All other capabilities are shipped as installable plugins. They can be installed, updated, and removed at runtime without restarting Kwirth:

| Plugin id | Description | Docs |
|---|---|---|
| `log` | Real-time log streaming | [Channels → Log](../channels?id=log) |
| `ops` | Day-to-day operations: shell, restarts, describe, exec | [Plugin reference → Ops](reference/ops) |
| `trivy` | Vulnerability scanning via Trivy OSS | [Channels → Trivy](../channels?id=trivy) |
| `fileman` | Visual filesystem explorer for all cluster containers | [Plugin reference → Fileman](reference/fileman) |
| `pinocchio` | AI/LLM integration for risk assessment and smart validation | [Plugin reference → Pinocchio](reference/pinocchio) |
| `censor` | LLM-based log noise filtering | [Plugin reference → Censor](reference/censor) |
| `topology` | Interactive 3D visualization of cluster resources and relationships | [Plugin reference → Topology](reference/topology) |
| `echo` | Reference plugin — useful for testing connectivity | [Plugin reference → Echo](reference/echo) |
| `news` | RSS news feed reader — test/demo plugin | [Plugin reference → News](reference/news) |
