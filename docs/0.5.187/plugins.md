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

## Developing your own plugin

If you want to build a custom plugin, you need to implement two TypeScript interfaces: one for the back side and one for the front side. The back interface defines how your plugin integrates with Kwirth core (WebSocket routing, Kubernetes events, instance management), and the front interface defines the React components (setup dialog, tab content) and the lifecycle callbacks.

The simplest way to start is by looking at the **Echo** plugin, which is the official reference implementation:

- [echo back channel on GitHub](https://github.com/kwirthmagnify/kwirth/tree/master/back/src/channels/echo)
- [echo front channel on GitHub](https://github.com/kwirthmagnify/kwirth/tree/master/front/src/channels/echo)

For the full interface specification and all available data structures, see the [Developing](./developing) section.
