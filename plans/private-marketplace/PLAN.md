# Private Marketplace Manifests — Plan

## Status (2026-09-04) — NOT STARTED

Goal: let an administrator register **additional** marketplace manifest URLs, so an organisation can
publish its own extensions (plugins, senders, providers, themes, homepages, webhooks, logins, packs, idp
connectors) without them living in the public Kwirth manifest.

**Additive, never a substitution.** The public OSS manifests stay exactly as they are, hardcoded in each
manager dialog. A registered private marketplace is a *second source* consulted alongside the public one;
removing every private entry must leave today's behaviour untouched.

Marketplaces are configuration of Kwirth itself, per cluster — like the metrics interval — so the list is
persisted server-side and the UI lives in cluster settings.

## Current state

**The public manifest URL is hardcoded once per dialog**, and that is fine — it is the OSS marketplace:

| Type | File | | Type | File |
|---|---|---|---|---|
| plugin | `front/src/components/PluginManagerDialog.tsx` | | pack | `front/src/components/PackManagerDialog.tsx` |
| sender | `front/src/components/SenderManagerDialog.tsx` | | login | `front/src/components/LoginManagerDialog.tsx` |
| provider | `front/src/components/ProviderManagerDialog.tsx` | | idp | `front/src/components/IdpManagerDialog.tsx` |
| homepage | `front/src/components/HomepageManagerDialog.tsx` | | webhook | `front/src/components/WebhookManagerDialog.tsx` |
| theme | `front/src/components/ThemeManagerDialog.tsx` | | docs | `front/src/components/DocsDialog.tsx` |

`front/src/App.tsx` holds an eleventh copy of the same list for the startup update check (see the
[[extension-upgrade]] plan). What has to be shared across all eleven is not the public URL — it is the
**merge step**: fetch the configured private manifests and combine them with the public one. Writing that
merge eleven times is what would drift.

**Persistence has an established pattern.** The back already stores Kwirth's own configuration through the
`IConfigMaps` abstraction (`read`/`write`/`writeKey`/`readAllKeys`, ConfigMap-backed in k8s, filesystem
under `KWIRTH_STORE`): `kwirth.keys` (`ApiKeyApi`), `kwirth-docs-index` (`DocsManager`),
`kwirth-store-common-*`. A marketplace list is the same kind of object and should reuse it — no new
storage mechanism is needed.

Note that `SettingsCluster.tsx` is not itself a precedent for this: it is a one-field dialog whose
`onClose` returns a bare `number`, and that value is POSTed to `/provider/metrics/config`, the metrics
*provider's* endpoint, not to Kwirth config. The dialog's contract has to widen regardless.

## Proposed steps

- **A — Storage + API.** Persist the list under a `kwirth-marketplaces` key via `IConfigMaps`, exposed by a
  small core API (`GET`/`PUT`), following `ApiKeyApi` as the model. Shape: a list of entries, each with a
  base URL expected to serve `<base>/<folder>/manifest.json` — mirroring the public layout so one entry
  covers every extension type — plus a label and an enabled flag.
- **B — Merge helper.** One shared helper that, for a given extension type, returns the public manifest
  entries plus those from every enabled private marketplace. Consumed by the ten dialogs and the update
  check, so the merge exists once. The public URL stays where it is; the helper just appends.
- **C — UI.** Add/remove/enable rows in `SettingsCluster`, with URL validation and a reachability test.
  Requires widening `onClose` beyond the current single number.
- **D — Merge semantics.** Dedupe by extension id and define precedence when an id appears in more than
  one source (public wins? most recently added wins? explicit order?). Show provenance on the card so the
  user can tell where an extension came from. The update check must consult private manifests too, or
  privately-installed extensions stay silently unflagged forever.

## Open questions

- **Authentication.** A genuinely private manifest usually sits behind auth. Does an entry carry a
  token/header, where is that credential stored (`ISecrets` rather than `IConfigMaps`, presumably), and
  who can read it back? Main design decision; settle it before A.
- **Fetch origin.** Manifests are fetched from the **browser** today, so a private URL would need CORS and
  reachability from the user's network, not just from the cluster. Proxying through the back would remove
  both constraints and give a single place to attach credentials — worth deciding as part of A, since it
  changes the API shape.
- **Trust.** Installing pulls a tarball from a URL the manifest supplies, so registering a marketplace is
  a privileged action: gate it on an admin scope, and decide whether anything validates what comes back.
