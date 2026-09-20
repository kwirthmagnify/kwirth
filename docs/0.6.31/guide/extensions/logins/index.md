# Login extensions (custom login pages)

> **Type:** Login extensions<br>
> **Managed from:** ☰ → Manage extensions → Login extensions

## What a login extension is

A **login extension** is a **custom-branded login page** that replaces (or coexists with) the standard kwirth login dialog. Each extension defines its own background image, colours, text labels and — most importantly — the **channel that opens after a successful login**.

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

When a login extension declares a `startChannel` in its configuration, kwirth **enforces** that the authenticating user has access to that channel:

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

A login extension is a `.tgz` archive containing up to four files:

| File | Required | Purpose |
|---|---|---|
| `package.json` | ✅ | Extension metadata — `id`, `displayName`, `version`, `extensionType: "login"` |
| `login.json` | ✅ | Visual configuration — see [Configuration reference](#configuration-reference) |
| `background.png` | optional | Full-screen background. **Must fit anywhere** — see below |
| `background-hi.png` | optional | The same background at full quality, with **no size limit**. Used where the storage allows it |

Build it with the `build.mjs` script from the `logins/_template` folder.

### Two backgrounds, and why

The background is stored **inside the extension's own record**, which means its size depends on *where
that record lives* — and that is not the same in every installation:

| Where kwirth stores its data | Limit per object |
|---|---|
| Kubernetes **ConfigMaps** (the default in a cluster) | **~1 MiB**, imposed by etcd |
| Filesystem — desktop, Docker, or a cluster with `KWIRTH_STORE` | none in practice |

A login cannot know which one it will land on. So it may ship **two** images and let kwirth choose:

- **`background.png`** — the one that has to fit **anywhere**. It is stored in base64, which makes it about
  a third larger, and kwirth reserves **800 KB** for the encoded form: in practice a PNG of about
  **600 KB or less**. `build.mjs` **fails the build** if you go over, because this is the image that
  guarantees the page looks right on any installation.
- **`background-hi.png`** — the same background at full quality, **with no limit**. Optional.

**What kwirth does when the extension is installed**, in this order:

1. If `background-hi.png` fits in the storage, it stores and serves **that one**.
2. Otherwise it falls back to `background.png` — this is not an error, it is what the file is for.
3. If **neither** fits, nothing is stored: the extension still installs, the page comes up without its
   background, and it shows a small red line asking the user to contact their kwirth administrator. The
   reason stays in the backend log, because the login page is served before anyone authenticates.

The backend log says which one it kept, and why, so you never have to guess whether you are looking at the
good image or the fallback.

> ⚠️ **The choice is made at install time, not at render time.** If you later move the installation from
> ConfigMaps to filesystem storage (`KWIRTH_STORE`), the logins already installed keep the image they were
> given — **reinstall them** to pick up the high-quality one.

If you only ship **one** image, nothing changes from before: it is used if it fits, and reported if it
does not. Two things help a large background fit: drop the alpha channel (a full-page background does not
need one) and scale it down. A photographic background at 1200×896 will not fit in a ConfigMap; the same
one at 600×448 does.

> ⚠️ **In dev it looks like it works.** A login declared in `kwirth-dev.json` reads its background straight
> from the tgz on disk — it never goes through storage — so it always shows `background-hi.png` when there
> is one, and an oversized image renders fine. The limit only bites once somebody installs the extension
> for real.

### `package.json` minimal example

```json
{
    "name": "@yourscope/login-myproduct",
    "id": "myproduct",
    "displayName": "My Product",
    "version": "0.1.0",
    "description": "Branded login for My Product",
    "extensionType": "login"
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
| `width` | string | `"320px"` | Width of the **content** of the login dialog — the box adds 24 px of padding on each side, so the rendered box is `width + 48 px` and the fields themselves are exactly `width`. See [Layout tips](#layout-tips). |
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
| `idpButton` | string | `"Log in with {provider}"` | Label for the IdP button. ⚠️ `{provider}` is substituted **only when exactly one** IdP is offered. With two or more the string is used **verbatim** as the dropdown label, so a value containing the placeholder renders a literal `LOG IN WITH {PROVIDER}`. Either restrict to a single IdP with `allowedIdps`, or use a placeholder-free label such as `"Log in with…"`. |
| `startChannel` | string | *(none)* | Channel slug to open after login. Also used as the channel access check — users without this channel in their `enabledChannels` are rejected. |
| `allowedIdps` | string[] | *(all)* | List of IdP IDs to show. Empty array `[]` hides all IdP buttons. Omit to show all configured IdPs. |

## What a login extension can and cannot change

The page is rendered by a **fixed** component. A login extension supplies **one** `login.json` and its background image (plus an optional high-quality variant); it cannot add markup. So:

| You can change | You cannot add |
|---|---|
| Full-page background (colour and/or image), position and width of the form box, its background, text colour, every label and button caption, which IdPs are offered, the channel opened after login | A logo slot, a second column, extra fields or selects, checkboxes, hyperlinks, a footer, or a differently-shaped primary button |

**The technique for a brand-faithful page** is therefore to **bake all the static chrome into `background.png`** — logo, headings, legal footer, colour bands — and position the live form box over the area you left empty for it. Everything baked into the image is decoration: it is **not clickable**, so do not bake anything a user would expect to click.

> ⚠️ **Themes do not reach the login page.** Installed themes are loaded after authentication (the front fetches them with the session's access key), so the login form is always rendered with kwirth's **default** MUI theme. Two consequences you cannot override from `login.json`: the field focus underline is the default blue, and button captions are **UPPERCASED**. A branded theme styles the session *after* login, not the login itself.

## Layout tips

- When `top` and `left` are both `"50%"`, the dialog is **centred** with CSS `translate(-50%, -50%)`. Set explicit pixel/percentage values (e.g. `"top": "65%", "left": "5%"`) to pin it to a specific spot — useful when a background image has a designated area for the login form.
- **Mind the 24 px padding when you pin the box.** `top`/`left` place the box's own corner, and `width` is the content width, so the fields start 24 px *inside* those coordinates. To land fields at x = 1218 with a width of 420 on a 1920-wide page, use `left: "62.2%"` (1194) and `width: "21.9%"` (420).
- Author the background at the **aspect ratio you expect** (16:9 for a typical monitor) and at the resolution your percentages assume. The image is drawn with `background-size: cover`, so on a different aspect ratio it is cropped while the form box stays at its percentage — baked chrome and live form then drift apart.
- Keep the background's source (an HTML mock-up, a design file) next to the extension and regenerate the PNG from it, rather than editing the PNG by hand: the numbers in `login.json` and the layout of the image have to stay in sync, and that is far easier to check when the layout is text.
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

> ⚠️ **Dev packages are installed only at back start-up.** Later attempts are skipped as *already installed*, so **rebuilding the `.tgz` does not refresh the configuration being served** — you will keep seeing the previous `login.json` and wonder why your edit did nothing. Either restart the back, or push the new values through the manager's **⚙ Settings** dialog (`PUT /core/logins/<id>/config`). The `background.png`, by contrast, is read from the package on every request in dev mode, so image changes do show up on a reload.

---

← Back to [Extension manuals](../index)
