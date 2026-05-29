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

![plugin architecture](./_media/kwirth-kwirth-channels.png ':class=imageclass80')

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

## Enabling and disabling plugins

Kwirth lets you control which plugins are active at startup. Plugins can be individually enabled or disabled via the Kwirth configuration. This is useful to reduce the attack surface in production or to deploy lightweight Kwirth instances focused on a specific use case.

![manageplugins](./_media/manage-plugins.png ':class=imageclass80')
When a plugin is disabled, both its back endpoint and its entry in the front channel registry are removed, so users will not see the corresponding channel option in the resource selector.

## Managing plugins at runtime

Kwirth supports **hot plugin management**: you can install, update or remove plugins on a running instance without modifying source code, without rebuilding, and without restarting Kwirth.

Plugins are stored as Kubernetes ConfigMaps and loaded dynamically at startup and on demand. The frontend injects each plugin's JavaScript as a `<script>` tag at runtime and registers it automatically.

### Plugin Manager UI

The easiest way to manage plugins is through the built-in Plugin Manager, accessible from the Kwirth settings menu.

![plugininstall](./_media/plugin-install.png ':class=imageclass80')

The dialog shows the curated plugin registry (fetched from the Kwirth manifest) with the available plugins, their version, and description. To install a plugin, click **Install** — Kwirth downloads the package, stores it in Kubernetes ConfigMaps, and activates it immediately. No restart required.

### Installing from a URL

You can install any plugin that is published as a `.tgz` bundle by sending a POST request to the Kwirth API:

```bash
curl -X POST https://<kwirth-host>/plugins/install \
  -H "Authorization: Bearer <access-key>" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://registry.npmjs.org/@kwirthmagnify/kwirth-plugin-topology/-/kwirth-plugin-topology-0.1.3.tgz"}'
```

The URL can point to any accessible HTTP/HTTPS server — npm registry, a private registry, an internal artifact store, or a plain file server.

### Installing from a file upload

If your Kwirth instance has no internet access, you can upload a plugin `.tgz` bundle directly:

```bash
curl -X POST https://<kwirth-host>/plugins/upload \
  -H "Authorization: Bearer <access-key>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @my-plugin-0.1.0.tgz
```

### Uninstalling a plugin

```bash
curl -X DELETE https://<kwirth-host>/plugins/<plugin-id> \
  -H "Authorization: Bearer <access-key>"
```

The plugin is removed from the ConfigMaps and unregistered from the active channel list immediately.

### Plugin bundle format

A plugin is a standard `.tgz` archive containing exactly two files:

```
kwirth-plugin-<id>-<version>.tgz
└── package/
    ├── package.json   ← metadata: id, name, version, description, icon
    ├── back.js        ← compiled backend channel code
    └── front.js       ← compiled frontend React channel code
```

Both `back.js` and `front.js` are self-contained compiled bundles — no `node_modules` needed.

### Hot-reload for development

When developing a custom plugin locally, you can avoid the install/upload cycle by pointing Kwirth at your local build output via `kwirth-dev.json` in the backend working directory:

```json
{
  "my-plugin": "../my-plugin/dist"
}
```

Kwirth watches the `back.js` and `front.js` files in those paths and reloads them automatically whenever they change. This gives you a fast edit → save → test loop without touching the running Kwirth instance.

## Built-in plugins

These plugins are bundled with Kwirth and enabled by default:

| Plugin id | Description | Docs |
|---|---|---|
| `log` | Real-time log streaming | [Channels → Log](./channels?id=log) |
| `metrics` | Real-time CPU / memory / I/O metrics (no Prometheus needed) | [Channels → Metrics](./channels?id=metrics) |
| `alert` | Backend-filtered log alerts by severity regex | [Channels → Alert](./channels?id=alert) |
| `trivy` | Vulnerability scanning via Trivy OSS | [Channels → Trivy](./channels?id=trivy) |
| `ops` | Day-to-day operations: shell, restarts, describe, exec | [Channels → Ops](./channels?id=ops) |
| `fileman` | Visual filesystem explorer for all cluster containers | [Channels → Fileman](./channels?id=fileman) |
| `magnify` | Full Kubernetes management tool (replaces Lens / K9s / Headlamp) | [Channels → Magnify](./channels?id=magnify) |
| `pinocchio` | AI/LLM integration for risk assessment and smart validation | [Channels → Pinocchio](./channels?id=pinocchio) |
| `topology` | Interactive 3D visualization of cluster resources and relationships | [Channels → Topology](./channels?id=topology) |
| `echo` | Reference plugin — useful for testing connectivity | [Channels → Echo](./channels?id=echo) |
| `news` | RSS news feed reader — test/demo plugin | [Channels → News](./channels?id=news) |

## Plugin reference

### echo

The **Echo** plugin is the official reference implementation. It periodically sends a configurable test message for every watched resource, which makes it ideal for verifying connectivity, testing sender pipelines, or learning how to build a plugin.

**Instance config (`IEchoInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `interval` | `number` | `5` | Seconds between messages |
| `senderId` | `string` | — | Optional sender to notify on start |
| `senderConfigName` | `string` | — | Config name for the sender above |

**Channel config (`IEchoConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `maxLines` | `number` | `3` | Maximum lines kept in the tab view |

The Echo plugin also subscribes to the **OTel provider** — if an OpenTelemetry provider is active, Echo forwards incoming traces, metrics, and logs to all running instances.

---

### news

The **News** plugin polls a set of RSS feeds and streams news items to the frontend tab in real time. Items are deduplicated across polls so each link is shown only once per session.

**Feeds available:**

| Feed key | Source |
|---|---|
| `kubernetes` | `kubernetes.io` official blog |
| `ai` | TechCrunch AI section |

**Instance config (`INewsInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `selectedFeeds` | `string[]` | `['kubernetes','ai']` | Which feed keys to subscribe to |

**Channel config (`INewsChannelConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `maxItems` | `number` | `50` | Maximum items kept in the tab view |

The poll interval is 5 minutes. The plugin does not require any Kubernetes resource — it works with `cluster: true` and selects any cluster-level object as its trigger.

---

### censor

The **Censor** plugin intercepts log streams from selected containers and runs them through an LLM to identify and filter out noise. It builds a growing set of regular expressions from the LLM analysis and applies them in-process to avoid sending every log line to the LLM.

**How it works:**

1. Log lines are accumulated in a buffer (configurable batch size).
2. When the buffer reaches `batchSize`, the batch is sent to the configured LLM with a system prompt asking it to return noise-matching regular expressions.
3. Newly learned regexes are added to the local filter list and applied to all subsequent lines.
4. Filtered lines, raw lines, LLM input/output, and stats (tokens in/out, processed/pending counts) are all streamed back to the frontend tab.

**Instance config (`ICensorInstanceConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | — | Config name |
| `llmId` | `string` | — | ID of the LLM to use (from the shared LLM list) |
| `system` | `string` | _(built-in)_ | System prompt sent to the LLM |
| `batchSize` | `number` | `50` | Lines to accumulate before triggering an LLM call |
| `exampleJson` | `string` | `{"patterns":[""]}` | Expected JSON output schema — drives structured output |
| `temperature` | `number` | `0.2` | LLM temperature |
| `active` | `boolean` | `false` | Whether filtering is active on start |
| `senderId` | `string` | — | Sender to use for alerts |
| `senderConfigName` | `string` | — | Config name for the sender above |

The plugin also supports **sessions**: a session captures the live log stream from a specific container into a named session object that can be connected and disconnected independently.

The Censor plugin requires the **events** and **business** providers to be active.

?> The headless version of Censor is available as the [Censor daemon](./daemons). Use the daemon when you want log filtering without opening a Kwirth tab.

---

### pinocchio

The **Pinocchio** plugin is the AI/LLM integration layer for Kwirth. It watches Kubernetes object lifecycle events (Pods, Deployments, Services, Ingresses, and more) and business data events, and runs configurable LLM-powered analyses on them. Results (findings with severity levels, explanations, and token usage) are streamed to the frontend tab in real time.

**Key concepts:**

- **Trigger**: a rule that says "when a Kubernetes object of kind X is created/modified/deleted — or when a business event arrives in space Y — invoke this LLM version".
- **Version**: a trigger can have multiple versions, each with a different LLM, system prompt, and tool set. Only one version is active at a time.
- **Playground**: an interactive mode where you can test any prompt + LLM combination against a real or synthetic event payload without setting up triggers.

**Trigger config (`IConfigTrigger`):**

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique trigger identifier |
| `trigger` | `'artifact' \| 'business'` | Whether it fires on Kubernetes events or business data |
| `kind` | `string` | Kubernetes kind to watch (e.g. `'Pod'`, `'Deployment'`) — only for `artifact` triggers |
| `versions` | `IConfigTriggerVersion[]` | List of versioned configurations for this trigger |

**Trigger version config (`IConfigTriggerVersion`):**

| Field | Type | Description |
|---|---|---|
| `llm` | `string` | LLM ID to invoke |
| `system` | `string` | System prompt (plain text or Jinja2 template) |
| `promptType` | `'jinja' \| 'artifact'` | Whether the prompt is a Jinja2 template or uses the artifact body directly |
| `prompt` | `string` | User prompt template |
| `action` | `'inform' \| 'cancel' \| 'repair'` | What to do with the finding |
| `steps` | `number` | Maximum LLM agent steps |
| `tools` | `string[]` | Tool names available to the LLM |
| `spaces` | `string[]` | Business spaces to subscribe to (for business triggers) |
| `enabled` | `boolean` | Whether this version is active |

**Supported Kubernetes kinds:**
`Pod`, `Deployment`, `DaemonSet`, `StatefulSet`, `ReplicaSet`, `Job`, `CronJob`, `ReplicationController`, `Service`, `Ingress`, `HTTPRoute`

The plugin requires the **events**, **business**, and **metrics** providers.

LLMs are configured via the shared LLM list (Settings → Manage LLMs). Supported providers: `google`, `openai`, `openrouter`, `mistral`, `groq`, `deepseek` — all accessed through the Vercel AI SDK.

---

### topology

The **Topology** plugin renders an interactive **3D visualization** of your Kubernetes cluster. Nodes represent workloads, services, ingresses, and persistent volumes; edges represent ownership and service-selection relationships. You can orbit, zoom, and pan the 3D canvas, click nodes to inspect them, and hide or filter by kind or namespace.

**Supported node kinds:** `Ingress`, `Service`, `Deployment`, `StatefulSet`, `DaemonSet`, `ReplicaSet`, `Job`, `CronJob`, `Pod`, `PersistentVolumeClaim`

**Node status colours** reflect the real-time state: Running (green), Pending (yellow), Failed (red), Succeeded (blue), Terminating (orange), Unknown (gray), and PVC-specific states (Bound, Released, Lost).

**Channel config (`ITopologyConfig`):**

| Field | Type | Default | Description |
|---|---|---|---|
| `showPods` | `boolean` | `true` | Show Pod nodes |
| `showServices` | `boolean` | `true` | Show Service nodes |
| `showIngresses` | `boolean` | `true` | Show Ingress nodes |
| `showDeployments` | `boolean` | `true` | Show Deployment nodes |
| `showStatefulSets` | `boolean` | `true` | Show StatefulSet nodes |
| `showDaemonSets` | `boolean` | `true` | Show DaemonSet nodes |
| `showJobs` | `boolean` | `false` | Show Job nodes |
| `showCronJobs` | `boolean` | `false` | Show CronJob nodes |
| `showPvcs` | `boolean` | `true` | Show PersistentVolumeClaim nodes |
| `showOnlyRunning` | `boolean` | `false` | Hide non-running workloads |
| `edgeAnimated` | `boolean` | `true` | Animate edge flow |
| `labelSize` | `number` | `12` | Font size for node labels (px) |
| `nodeSpacingFactor` | `number` | `0.5` | Multiplier for the 3D layout spacing |
| `gridColumns` | `number` | `8` | Columns in the initial grid layout |

**Instance config (`ITopologyInstanceConfig`):** optional filters by pod name, service name, ingress name, or group (`Kind/name` format). Leave empty to show the full cluster.

The Topology plugin requires the **events** provider and is cluster-scoped (no specific resource needed).

---

## Developing your own plugin

If you want to build a custom plugin, you need to implement two TypeScript interfaces: one for the back side and one for the front side. The back interface defines how your plugin integrates with Kwirth core (WebSocket routing, Kubernetes events, instance management), and the front interface defines the React components (setup dialog, tab content) and the lifecycle callbacks.

The simplest way to start is by looking at the **Echo** plugin, which is the official reference implementation:

- [echo back channel on GitHub](https://github.com/kwirthmagnify/kwirth/tree/master/back/src/channels/echo)
- [echo front channel on GitHub](https://github.com/kwirthmagnify/kwirth/tree/master/front/src/channels/echo)

For the full interface specification and all available data structures, see the [Developing](./developing) section.
