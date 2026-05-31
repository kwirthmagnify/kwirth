# Managing plugins

## Enabling and disabling plugins

Kwirth lets you control which plugins are active at startup. Plugins can be individually enabled or disabled via the Kwirth configuration. This is useful to reduce the attack surface in production or to deploy lightweight Kwirth instances focused on a specific use case.

![manageplugins](../_media/manage-plugins.png ':class=imageclass80')

When a plugin is disabled, both its back endpoint and its entry in the front channel registry are removed, so users will not see the corresponding channel option in the resource selector.

## Managing plugins at runtime

Kwirth supports **hot plugin management**: you can install, update or remove plugins on a running instance without modifying source code, without rebuilding, and without restarting Kwirth.

Plugins are stored as Kubernetes ConfigMaps and loaded dynamically at startup and on demand. The frontend injects each plugin's JavaScript as a `<script>` tag at runtime and registers it automatically.

### Plugin Manager UI

The easiest way to manage plugins is through the built-in Plugin Manager, accessible from the Kwirth settings menu.

![plugininstall](../_media/plugin-install.png ':class=imageclass80')

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
