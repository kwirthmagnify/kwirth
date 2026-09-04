# In-place Extension Upgrade — Plan

## Status (2026-09-04) — NOT STARTED

Detection is done; acting on it is not. Kwirth now tells the user which installed extensions have a
newer version in the marketplace, but there is no way to upgrade from the UI: the only path is
uninstall + reinstall, which discards the extension's stored configuration.

## What exists today

The update check lives in `front/src/App.tsx`, inside the `useEffect` keyed on `[logged, backendUrl]`:

- Runs in **every environment** (the old `NODE_ENV !== 'production'` gate was removed), governed by the
  user setting `checkExtensionUpdates` (`front/src/model/Settings.ts`, checkbox in
  `front/src/components/settings/SettingsUser.tsx`, default on).
- Compares all **10 extension types** — plugin, sender, provider, theme, homepage, webhook, login, pack,
  docs, idp — against their GitHub `manifest.json`, skipping `installedFrom === 'dev'` and entries with
  no version. `idp` reads from `/idp/connectors`; the rest from `/core/<type>`.
- Surfaces one aggregated `notify(undefined, ENotifyLevel.WARNING, 'Updates available: …')`, which
  renders as the orange snackbar and persists in the notification bell list.

It fires **once per login**. There is no periodic re-check and no re-check when a manager dialog opens.

## What is missing

1. **No in-place upgrade.** In `PluginManagerDialog.tsx` the Install button is hard-disabled for an id
   that is already installed, with the tooltip `'Already installed — uninstall first'`. The same pattern
   repeats in the sibling manager dialogs (sender, provider, theme, homepage, webhook, login, pack, idp).
   Upgrading therefore means uninstall + reinstall, losing the extension's config.
2. **The notice is far from the action.** The warning is a transient toast plus a bell entry. The place
   the user actually reads a version — the installed card in the manager dialog — shows no indication
   that a newer one exists. `PluginCard` already declares a `badge` prop that is unused for installed
   items, which is the natural hook.

## Proposed steps

- **A — Badge.** Surface "update available" on the installed card of every manager dialog, reusing the
  same manifest-vs-installed comparison the App.tsx check performs. Extract that comparison into a shared
  helper so the dialogs and the startup check cannot drift apart.
- **B — Upgrade action.** Replace the hard-disabled Install button with an Upgrade action when the
  manifest version is greater, wired to an install path that **preserves stored config** rather than
  going through uninstall. Needs a decision per type on where config lives and whether a restart is
  required (several install paths already return `requiresRestart`).
- **C — Re-check on dialog open.** Compare on mount of each manager dialog, so the state is fresh when
  the user is actually looking at it, not only from the once-per-login startup check.

## Notes / gotchas

- `versionGreaterThan` (`common/src/Version.ts`) parses numerically per dot-segment, so `0.2.20 > 0.2.19`
  is correct. It collapses non-numeric segments to their numeric prefix, so `1.0.0-rc1` compares equal to
  `1.0.0` and would never be flagged — relevant if pre-release versions ever reach a manifest.
- Manifests are fetched from `raw.githubusercontent.com/.../master`, so an air-gapped or proxied
  in-cluster deployment silently degrades to "no updates" (every fetch failure resolves to `[]`).
- Paid artifacts never reach a public manifest, so they will never be flagged. `webhooks/manifest.json`
  exists but is empty for exactly this reason (only `jira`, which is paid).
