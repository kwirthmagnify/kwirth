# Login extensions (custom login pages)

> **Type:** Login extensions<br>
> **Managed from:** ☰ → Manage extensions → Login extensions

## What a login extension is

A **login extension** is a **custom-branded login page** that replaces (or coexists with) the standard Kwirth login dialog. Each extension defines its own background image, colours, text labels and — most importantly — the **channel that opens after a successful login**.

Users reach a login extension by navigating to:

```
https://<kwirth-host>/?loginExt=<id>
```

For example, `/?loginExt=magnify` renders the Magnify-branded login page. Users can bookmark that URL and use it as their entry point; the standard login page remains available at the root.

## The manager

Open **☰ → Manage extensions → Login extensions**:

- Each installed extension is shown as a **card** with its name, version badge and source (`bundled`, `dev`, or the URL it was installed from).
- Unlike other extension families, there is **no activate / deactivate** — every installed login extension is immediately accessible via its URL slug.
- Cards have two actions: **open website** (if the extension declares one) and **🗑 uninstall**.

### Runtime configuration

If an extension declares a `configSchema` in its `package.json`, a **⚙ Settings** button appears on its card. Clicking it opens a configuration dialog where the admin can set the values that the extension needs at runtime (credentials, URLs, scope, etc.) **without touching the extension package**.

Configuration is stored in a dedicated Kubernetes ConfigMap and is applied immediately — no restart required.

## Install / uninstall

- **Install from URL** — paste the `.tgz` package URL and click **Install**.
- **Install from file** — click **BROWSE…** to upload a local `.tgz` package.
- **Uninstall** — click 🗑 on the card. The URL `/?loginExt=<id>` will then fall back to the standard login.

## Channel access control

When a login extension declares a `startChannel` in its configuration, Kwirth **enforces** that the authenticating user has access to that channel:

- **Password login** — checked immediately after credential validation.
- **IdP / SSO login** — checked after the OAuth callback, before the session is established.

If the user's `enabledChannels` does not include the required channel, login is **rejected** with a clear error message and the user stays on the login extension page.

> Users with `enabledChannels` left empty (i.e. *all channels*) always pass the channel check.

## Bundled login extensions

| Extension | Description |
|---|---|
| **[Anonymous](anonymous)** | Auto-login without a form — ideal for public or demo deployments. |
| **[Magnify](magnify)** | Branded login page for the Magnify channel. |

Additional login extensions may be shipped alongside their corresponding plugin (e.g. Excubitor, Montag) and appear in the manager when those plugins are installed.

## Creating a login extension

A login extension is a `.tgz` archive containing three files:

| File | Required | Purpose |
|---|---|---|
| `package.json` | ✅ | Extension metadata — `id`, `displayName`, `version`, `targetType: "login"` |
| `login.json` | ✅ | Visual configuration — see [Configuration reference](#configuration-reference) |
| `background.png` | optional | Full-screen background image |

Build it with the `build.mjs` script from the `logins/_template` folder.

### `package.json` minimal example

```json
{
    "name": "@yourscope/login-myproduct",
    "id": "myproduct",
    "displayName": "My Product",
    "version": "0.1.0",
    "description": "Branded login for My Product",
    "targetType": "login"
}
```

### `configSchema` — runtime configuration fields

If your extension requires values that should not be baked into the package (credentials, API keys, runtime parameters), declare a `configSchema` array in `package.json`. The admin fills these values from the **⚙ Settings** dialog in the Login Manager; the values are served via `GET /core/logins/<id>/config` and merged with `login.json` at runtime.

Each entry supports:

| Property | Type | Description |
|---|---|---|
| `name` | string | Key name (matches the field in `login.json`). |
| `label` | string | Human-readable label shown in the dialog. |
| `type` | `text` \| `password` \| `number` \| `boolean` \| `select` | Field type. `password` adds a visibility toggle. `select` renders a dropdown using the `options` array. |
| `required` | boolean | Marks the field as required in the dialog. |
| `options` | string[] | For `type: "select"` — list of valid values. |

Example:

```json
{
    "configSchema": [
        { "name": "apiKey", "label": "API Key", "type": "password", "required": true },
        { "name": "mode", "label": "Mode", "type": "select", "options": ["read", "write"] }
    ]
}
```

## Configuration reference

All fields in `login.json` are optional. Omit a field to use the default value shown.

| Field | Type | Default | Description |
|---|---|---|---|
| `top` | string | `"50%"` | CSS `top` of the login dialog. `"50%"` with `left: "50%"` = centred. |
| `left` | string | `"50%"` | CSS `left` of the login dialog. |
| `width` | string | `"320px"` | Width of the login dialog box. |
| `height` | string | *(auto)* | Fixed height. Omit to grow with content. |
| `pageBackground` | string | `"#1a1a2e"` | Full-page background colour (shown when no background image, or while loading). |
| `dialogBackground` | string | `"rgba(0,0,0,0.55)"` | Background of the login dialog box. Use `transparent` to position fields freely over the page background. |
| `textColor` | string | *(theme)* | Colour for labels, text and button borders inside the dialog. |
| `title` | string | *(none)* | Optional heading rendered above the form fields. |
| `userLabel` | string | `"User"` | Label for the username field. |
| `passwordLabel` | string | `"Password"` | Label for the password field. |
| `newPasswordLabel` | string | `"New password"` | Label shown during the change-password flow. |
| `repeatPasswordLabel` | string | `"Repeat new password"` | Second password field label during change flow. |
| `changePasswordMessage` | string | *(built-in)* | Text shown at the top of the change-password form. |
| `changePasswordButton` | string | `"Change password"` | Label of the Change Password button. |
| `okButton` | string | `"Login"` | Label of the primary Login button. |
| `orSeparator` | string | `"or"` | Separator text between the password form and IdP buttons. |
| `idpButton` | string | `"Log in with {provider}"` | Label for a single IdP button. `{provider}` is replaced with the IdP's display name. When there are multiple IdPs, this becomes the dropdown label. |
| `startChannel` | string | *(none)* | Channel slug to open after login. Also used as the channel access check — users without this channel in their `enabledChannels` are rejected. |
| `allowedIdps` | string[] | *(all)* | List of IdP IDs to show. Empty array `[]` hides all IdP buttons. Omit to show all configured IdPs. |

## Layout tips

- When `top` and `left` are both `"50%"`, the dialog is **centred** with CSS `translate(-50%, -50%)`. Set explicit pixel/percentage values (e.g. `"top": "65%", "left": "5%"`) to pin it to a specific spot — useful when a background image has a designated area for the login form.
- Set `dialogBackground: "transparent"` and omit `title` to achieve a minimal look where only the form fields and buttons float over the background image.
- The background image is served from the extension package. If it exceeds the ConfigMap storage limit (~800 KB) it is served directly from the dev package in development mode and excluded from the Kubernetes ConfigMap in production.

## Dev mode

Add the extension to `kwirth-dev.json` under `logins`:

```json
{
    "logins": {
        "myproduct": "../logins/myproduct/dist/myproduct.tgz"
    }
}
```

Restart the back after changes. The card in the manager shows a **`dev`** badge.

---

← Back to [Extension manuals](../index)
