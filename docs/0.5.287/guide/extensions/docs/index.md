# Documentation packages

> **Type:** Documentation  
> **Managed from:** ☰ → Manage extensions → Documentation

## What a documentation package is

A **documentation package** is a self-contained **docsify site** bundled as a `.tgz` file that Kwirth installs and serves directly from its own back end. Once installed, the package is accessible from the browser without any external dependency — the Kwirth server itself acts as the documentation host.

A documentation package always documents **another extension**, so it is identified by the pair that points at it:

- **`targetType`** — the *type* of the extension being documented: `plugin`, `provider`, `sender`, `theme`, `homepage`, `idp`, `login`, or `core` for the Kwirth core itself.
- **`id`** — the id of that very extension. `excubitor` docs carry `targetType: plugin` and `id: excubitor`, because they document the `excubitor` **plugin**.

The id alone is not enough: a plugin and a theme may both be called `metrics` and each may ship its own guide, so the pair is what makes a documentation package unique. The installed docs are served at `/docs/<targetType>/<id>/`, and Kwirth uses the same pair to link the **Help** buttons of an extension to its guide.

The `core/kwirth` package — the guide you are reading right now — documents the core itself and ships **bundled** with every Kwirth deployment.

## Admin guide

Open the manager from **☰ → Manage extensions → Documentation**.

![Documentation manager](../../../_media/guide/admin-docs-manage.png)

### Installed documentation packages

The left panel lists every installed documentation package. Each card shows the **name**, **version**, a short **description**, its **source chip** and two action icons:

| Source chip | Meaning |
|---|---|
| `bundled` | Shipped with Kwirth; **cannot be uninstalled** |
| `dev` | Loaded from a local build (development only) |
| `local` | Installed from a file you uploaded |
| `Kwirth` | Installed from the official kwirthmagnify registry |
| URL chip | Installed from a custom URL |

Icons per card:
- **🌐 Open website** — opens the extension's homepage in a new tab.
- **📖 Open docs** — opens the documentation site in a new browser tab.
- **🗑 Uninstall** — removes the package (not available for `bundled` or `dev` packages).

Use **Card / List** to toggle between grid and compact list, and the **Filter** field to narrow by name.

### Installing a documentation package

**From URL:**
1. Paste the `.tgz` URL in the **Install documentation package** field.
2. Click **Download** (⬇).
3. The package appears in the installed list once extraction completes.

**From a local file:**
1. Click **Browse…** next to the install field.
2. Select a `.tgz` or `.tar.gz` file from your machine.
3. The file is uploaded and extracted server-side.

**From the registry:**
When the public kwirthmagnify registry is reachable, the **Available documentation** section lists packages you can install with a single click.

### Uninstalling

Click the **🗑 delete** icon on any non-bundled, non-dev card. The package directory is removed from the server and the entry disappears from the list.

## Notes

- **Kubernetes ephemeral storage.** In a standard Kubernetes deployment `/tmp` is ephemeral — Kwirth re-downloads all URL-installed packages on each pod restart automatically. `bundled` packages are always present; `local` (file-uploaded) packages are **not** re-hydrated and must be re-uploaded if the pod restarts.
- **Package format.** A valid package is a `.tgz` with a `package.json` at its root containing at least `targetType`, `id`, `name`, and `version` fields, plus a docsify `index.html` and its markdown content.
- **Access control.** Reading installed docs (`GET /docs`) is public. Installing, uploading and uninstalling require an **admin** API key.

---

← Back to [Extension manuals](../index)
