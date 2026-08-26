# Anonymous login extension

> **Type:** Login extension<br>
> **URL slug:** `anonymous`<br>
> **Config required:** yes (admin must set credentials via ⚙ Settings)

## What it does

The **Anonymous** extension is designed for **public or demo deployments** where users must not see a login form. When a visitor navigates to `/?loginExt=anonymous`:

1. A full-screen spinner is shown while the extension auto-submits credentials configured by the admin.
2. On success the configured channel opens directly.
3. On failure (wrong credentials, no config, network error) an error message replaces the spinner — no form is ever displayed.

The user never needs to type a username or password.

## Configuration

Open **⚙ Settings** on the `anonymous` card in **☰ → Manage extensions → Login extensions** and fill in:

| Field | Required | Description |
|---|---|---|
| **Auto-login user** | ✅ | Kwirth username used for the automatic login. |
| **Auto-login password** | ✅ | Password for that user. |
| **Start channel** | | Channel slug to open after login (e.g. `magnify`). Leave blank to land on the home screen. |
| **Scope** | | Resource scope for the channel: `cluster`, `namespace`, `group`, `pod`, or `container`. Defaults to `cluster`. |
| **Namespace(s)** | | Comma-separated namespaces (only relevant for `namespace` / `group` / `pod` / `container` scopes). |
| **Group(s)** | | Comma-separated groups in `type+name` format (e.g. `replica+my-rs`). |
| **Pod(s)** | | Comma-separated pod names. |
| **Container(s)** | | Comma-separated container names. |

The Scope field is a dropdown with the five valid values; the resource fields below it narrow down what the channel will show to the user.

> **Security note:** the auto-login user should have a minimal, read-only access key scoped only to the resources you intend to expose. Never use an admin account.

## How it works internally

The extension has **no UI of its own** — it renders only a spinner while it issues a standard password-login request using the credentials from its ConfigMap. Once authenticated it calls `populateTabObject` with the configured channel and scope, exactly as if the user had selected those resources manually from the resource selector.

Because the extension sets the scope and resources programmatically, resource-scoped channels (namespace / group / pod / container) work correctly without the user having to interact with the resource selector.

---

← Back to [Login extensions](index)
