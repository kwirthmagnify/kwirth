# Packs (extension bundles)

> **Type:** Pack  
> **Managed from:** ☰ → Manage extensions → Packs

## What a pack is

A **pack** is a single `.tgz` archive that contains **multiple extensions at once** — plugins, providers, senders, themes, homepages, IdP connectors, login pages, webhooks and documentation. Every installable extension type can travel in a pack; the only thing a pack cannot contain is another pack. Installing one pack installs all its members in a single operation, with no need to install each extension individually.

Packs are the recommended way to distribute **curated extension sets** — for example, a "dark ops" pack that bundles the Post-Punk theme, the Matrix homepage and the Ops plugin, or a vendor pack that ships a plugin together with the login page that fronts it, the webhook that feeds it and its own user guide.

## How packs work

A pack is a fat `.tgz` with the following layout:

```
package/
├── package.json      # pack metadata (extensionType: "pack")
├── pack.json         # list of member extensions
├── member-a.tgz      # inner tgz for extension A
├── member-b.tgz      # inner tgz for extension B
└── ...
```

When installed, Kwirth:
1. Verifies that **none** of the member extensions is already installed (including dev-loaded ones). If any member is already present the entire pack is rejected.
2. Installs every member using the same logic as a direct individual install.
3. Records the pack metadata in a dedicated ConfigMap (`kwirth-packs`).
4. Tags every member's metadata with `installedFrom: "pack:<packId>"`.

## Install rules

| Rule | Reason |
|---|---|
| All members must be absent | Prevents silent overwrites and version conflicts |
| Members inherit `installedFrom: "pack:<id>"` | Enables the pack-ownership badge and the uninstall guard |
| A pack cannot be installed twice | The pack id must also be absent |

## The Packs manager

Open **☰ → Manage extensions → Packs**. The layout follows the same card/list pattern as every other extension family:

### Installed packs

Each card shows:
- **Name** and **version** badge.
- **Description**.
- **Source** chip — `local` for a file upload, a URL chip for an online install, or a `Kwirth` chip for registry installs.
- **Member summary** — a compact count of the bundled extension types (e.g. *1 theme, 1 homepage, 1 plugin*).
- **🗑 Uninstall** — removes the pack and all its members at once.

### Installing a pack

**From URL:**
1. Paste the `.tgz` URL in the **Install pack** field.
2. Click **Download** (⬇).
3. Kwirth downloads the pack, validates and installs all members, then lists the pack in the installed section.

**From a local file:**
1. Click **Browse…** next to the install field.
2. Select a `.pack.tgz` (or `.tgz`) file from your machine.
3. The file is uploaded and extracted server-side.

**From the registry:**
When the public kwirthmagnify registry is reachable, the **Available packs** section lists curated packs you can install with a single click.

### Uninstalling

Click **🗑** on the pack card. Kwirth uninstalls every member extension and removes the pack record. Member extensions that are currently active (theme, homepage, plugin) are deactivated immediately — no page reload required.

## Pack-owned extensions in individual managers

Extensions installed via a pack show a **`via pack`** badge in the manager of their own family (e.g. a theme installed by a pack shows `via pack` in the Theme manager). Their **uninstall button is disabled** — you must uninstall the parent pack, not the individual extension.

This prevents partial teardowns that would leave the pack metadata inconsistent.

## Creating a pack

Use the `create-pack.mjs` script at the root of the repository:

```bash
node packs/create-pack.mjs <pack-id> [options]
```

### Options

| Option | Description |
|---|---|
| `--include <type>:<name>` | Build and pack an extension from source, then include it. Repeatable. Types: `plugin`, `provider`, `sender`, `theme`, `homepage`, `idp`, `login`, `webhook`. Documentation has no source folder of its own — each plugin generates its tgz with `build-docs-tgz.mjs` — so it is passed as a plain `.tgz` path instead. |
| `--name "<display name>"` | Human-readable pack name (default: `pack-id`). |
| `--version "1.0.0"` | Pack version (default: `1.0.0`). |
| `--description "..."` | Short description. |
| `--website "https://..."` | Homepage URL. |
| `--output path/to/out.pack.tgz` | Output file (default: `<id>-<version>.pack.tgz`). |

Alternatively, pass pre-built `.tgz` files as positional arguments alongside (or instead of) `--include`.

### Examples

```bash
# Build from source and bundle
node packs/create-pack.mjs dark-ops \
  --include theme:post-punk \
  --include homepage:matrix \
  --include plugin:ops \
  --name "Dark Ops" --version "1.0.0"

# Mix pre-built tgzs and --include
node packs/create-pack.mjs my-pack ./plugins/foo/dist/foo-1.0.0.tgz \
  --include theme:avicii \
  --name "My Pack"
```

`--include` runs `node build.mjs` and `npm pack` inside the extension directory, picks the resulting `.tgz`, and embeds it in the pack — so the pack always contains a freshly built artifact.

### `package.json` format

```json
{
    "name": "@yourscope/my-pack",
    "id": "my-pack",
    "displayName": "My Pack",
    "version": "1.0.0",
    "description": "A curated set of extensions",
    "extensionType": "pack"
}
```

> **`extensionType`** must be `"pack"`. This is the field Kwirth uses to recognise a pack tgz.

### `pack.json` format

```json
{
    "extensions": [
        { "extensionType": "theme",    "id": "post-punk", "tgz": "kwirthmagnify-theme-post-punk-1.0.0.tgz" },
        { "extensionType": "homepage", "id": "matrix",    "tgz": "kwirthmagnify-homepage-matrix-1.0.0.tgz" },
        { "extensionType": "plugin",   "id": "ops",       "tgz": "kwirthmagnify-ops-0.5.0.tgz" },
        { "extensionType": "webhook",  "id": "jira",      "tgz": "kwirthmagnify-webhook-jira-0.1.1.tgz" },
        { "extensionType": "docs",     "id": "ops",       "tgz": "docs-ops-0.5.0.tgz", "targetType": "plugin" }
    ]
}
```

| Field | Description |
|---|---|
| `extensionType` | `plugin`, `provider`, `sender`, `theme`, `homepage`, `idp`, `login`, `webhook` or `docs` |
| `id` | The extension's `id` as declared in its own `package.json` |
| `tgz` | Filename of the member `.tgz` inside the pack archive |
| `targetType` | **Documentation only, and required there:** the *type* of the extension the guide documents. A guide's `id` is the id of what it documents, so it repeats across types — the pair identifies it. See [Documentation packages](extensions/docs/index.md). |

## Notes

- **Atomic validation, non-atomic install.** All member conflicts are checked before any installation begins. However, if one member's install fails mid-way, already-installed members are **not** rolled back automatically. Remove the partial members manually before retrying.
- **Pack catalog.** The public `packs/manifest.json` in the kwirthmagnify repository is the source for the **Available packs** registry view. Submit a PR to list your pack there.
- **Dev mode.** Packs do not have a `dev` mode of their own. Develop and test member extensions individually with `kwirth-dev.json`, then bundle them into a pack for distribution.

---

← Back to [Extension manuals](../index)
