# Private Marketplace Manifests — Plan

## Status (2026-09-04) — NOT STARTED

Goal: let an administrator register **additional, private marketplace manifest URLs** in cluster
settings, so an organisation can publish its own extensions (plugins, senders, providers, themes,
homepages, webhooks, logins, packs, idp connectors) without them living in the public Kwirth manifest.

## Current state

**Manifest URLs are hardcoded, once per dialog.** Every manager dialog carries its own const pointing at
`raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master/<folder>/manifest.json`:

| Type | File |
|---|---|
| plugin | `front/src/components/PluginManagerDialog.tsx` |
| sender | `front/src/components/SenderManagerDialog.tsx` |
| provider | `front/src/components/ProviderManagerDialog.tsx` |
| homepage | `front/src/components/HomepageManagerDialog.tsx` |
| theme | `front/src/components/ThemeManagerDialog.tsx` |
| pack | `front/src/components/PackManagerDialog.tsx` |
| login | `front/src/components/LoginManagerDialog.tsx` |
| idp | `front/src/components/IdpManagerDialog.tsx` |
| webhook | `front/src/components/WebhookManagerDialog.tsx` |
| docs | `front/src/components/DocsDialog.tsx` |

The startup update check in `front/src/App.tsx` holds an **eleventh copy** of the same list (see
[[extension-upgrade]] plan). Any private-manifest support has to reach all of them, so the URLs must be
centralised before anything else — otherwise the feature works in some dialogs and not others.

**There is no cluster-level config store.** `front/src/components/settings/SettingsCluster.tsx` is a
one-field dialog (metrics interval) whose `onClose` returns a bare `number`. That single setting is not
persisted as cluster config at all: `App.tsx` POSTs it to `/provider/metrics/config`, the metrics
*provider's* own endpoint. So this feature needs a genuine cluster-scoped config store created for it,
not just a new field in an existing one.

## Proposed steps

- **A — Centralise manifest resolution.** One helper that returns the manifest URL list for a given
  extension type, consumed by all 10 dialogs and by the update check. Pure refactor, no behaviour change;
  everything else depends on it.
- **B — Cluster config store.** A real cluster-scoped store (ConfigMap-backed, like the other core
  config) holding the private manifest list. Decide the shape: flat list of URLs applying to every type,
  or per-type lists. A flat list of *base* URLs (each expected to expose `<base>/<folder>/manifest.json`)
  mirrors how the public one is laid out and keeps the UI simple.
- **C — UI.** Add/remove/reorder rows in `SettingsCluster`, with URL validation and a reachability test
  button. Requires widening the dialog's `onClose` contract beyond the current single number.
- **D — Merge semantics.** Combine official + private entries: dedupe by extension id, define precedence
  when the same id appears in both, and show provenance on the card so the user knows where an extension
  came from. The update check must consider private manifests too, or private extensions will be reported
  as up-to-date forever.

## Open questions

- **Authentication.** A genuinely private manifest usually sits behind auth. Does a registered URL carry
  a token/header? Where is that credential stored, and who can read it back? This is the main design
  decision and it should be settled before B.
- **Fetch origin.** Manifests are fetched from the **browser** today, so a private URL must be
  CORS-enabled and reachable from the user's network — not just from the cluster. Proxying the fetch
  through the back would sidestep both problems and give a single place to attach credentials; worth
  considering as part of A.
- **Trust.** Installing pulls a tarball from a URL the manifest supplies. Registering a marketplace is
  therefore a privileged action — it should be gated on an admin scope, and it is worth deciding whether
  anything validates what comes back.
