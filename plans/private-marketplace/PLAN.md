# Private Marketplace Manifests — Plan

## Status (2026-09-04) — NOT STARTED

Goal: let an administrator register **additional** marketplace manifest URLs, so an organisation can
publish its own extensions (plugins, senders, providers, themes, homepages, webhooks, logins, packs, idp
connectors) without them living in the public Kwirth manifest.

**Additive as a source, with precedence per id.** The public OSS manifests stay exactly as they are,
hardcoded in each manager dialog, and are never replaced as a source — they become the last entry in the
lookup order. A private marketplace *can* shadow an individual id (that is the point: publishing your own
`log` without colliding with the public one), but it can never remove the public marketplace itself.
Removing every private entry must leave today's behaviour untouched.

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

- **A — Storage.** The marketplace list joins `IKwirthSettings` as `marketplaces`, persisted in the
  existing `kwirth.settings` document — `SettingsApi`'s PUT already merges, so adding a field needs no new
  route, only validation of the list shape. Each entry: a stable `id`, a base URL expected to serve
  `<base>/<folder>/manifest.json` (mirroring the public layout, so one entry covers all ten types), a
  `label`, and an `enabled` flag.

  **Basic auth credentials do NOT live here.** `kwirth.settings` is an unencrypted ConfigMap; passwords
  belong in `ISecrets`, which is AES-256-GCM encrypted on the filesystem backends and RBAC-protected in
  k8s. So the entry carries at most `auth: { type: 'basic', username }`, with the password stored in
  `ISecrets` keyed by the marketplace `id`. Two consequences the implementation must honour: `GET
  /core/settings` never returns the password — it returns a `hasPassword` boolean instead — and a PUT that
  omits the password leaves the stored one untouched rather than clearing it.

- **B — Back-side resolution behind one endpoint.** The back fetches the manifests and applies the
  precedence of step D, exposing a single endpoint per extension type that returns the already-resolved
  list with provenance stamped on each entry. The ten dialogs and the update check consume that instead of
  fetching manifests themselves.

  Doing the resolution server-side rather than shipping a helper to the front buys three things: the
  precedence rule lives in one testable place instead of being re-applied in eleven; the back is where
  Basic auth credentials can be attached without ever reaching the browser; and it removes the asymmetry
  that motivated the proxy, since the back is already what downloads tarballs at install time.

  **Consequence worth flagging:** for the back to resolve, it needs every source, the public one included.
  The ten hardcoded public URLs therefore move from the ten dialogs into a single list in the back. They
  stay hardcoded and stay the OSS marketplace — this only deduplicates ten copies into one and is a
  side effect of proxying, not a change of policy.
- **C — UI.** Add/remove/enable rows in `SettingsKwirth`, with URL validation and a reachability test that
  exercises the credentials too, so a wrong password is caught while configuring rather than showing up as
  an empty extension list later. The dialog already reads and writes `/core/settings` on its own, so this
  extends it rather than rewiring it. The password field is `type=password` with a visibility toggle, and
  renders as already-set (not blank) when `hasPassword` comes back true.

- **C2 — Provenance badge on every card.** Each extension card, across all ten manager dialogs, gets a
  visual indicator with a tooltip naming where that extension came from — which marketplace served it, or
  `dev` / a pack for the existing local cases. With shadowing this is not decoration: when a private and a
  public marketplace both publish `log`, the badge is the only way to tell which one is on screen, and
  which one an installed copy was downloaded from.

  There is groundwork to reuse: `installedFrom` already exists on installed entries (today it marks `dev`
  and `pack:<id>` origins) and `IdpManagerDialog` already has a `resolveSource(installedFrom)` helper for
  rendering it. Generalise that helper so all ten dialogs share it, and extend `installedFrom` to record
  the originating marketplace at install time — which is also what pins version comparison to the right
  source (see D). `RemoteBadge` in `ResourceSelector.tsx` is a good shape to copy for the badge itself.
- **D — Resolution semantics. DECIDED: private marketplaces take precedence, the public OSS manifest is
  always last.** Among several private marketplaces, their configured order decides.

  **Resolution happens per id, at marketplace granularity — versions are never merged across
  marketplaces.** A manifest holds *many* entries per id, one per published version, so the rule is: find
  the first marketplace in the lookup order that contains the id **at all**, and take that marketplace's
  entries for it — the whole version list. Every other marketplace's entries for the same id are dropped
  outright, not blended in. An organisation publishing its own `log` therefore gets *its* `log` and *its*
  version history; the public `log` and all its versions disappear from view rather than interleaving.

  Concretely, the `manifest.filter(m => m.id === inst.id)` the update check performs today must run
  against the winning marketplace's entries alone, never against a concatenation of every source —
  otherwise a private `log 1.0.0` and the public `log 0.2.20` would end up in the same version list.

  Show provenance on the card: with shadowing, that is the only way to know *which* `log` is on screen.

  Two consequences of shadowing that the implementation has to respect:
  - The update check must resolve precedence **before** comparing versions, otherwise an installed private
    `log` would be compared against the public `log` manifest and report nonsense. This is the main reason
    the merge belongs in one shared helper (step B) rather than being rewritten per dialog.
  - An extension installed from the public marketplace *before* a private one registered the same id would
    silently start comparing against the private manifest, which can surface a bogus update or downgrade.
    The existing `installedFrom` field (already used to skip `'dev'`) looks like the right place to record
    the originating marketplace so the comparison can stay pinned to the source it was installed from.

## Settled

- **The back proxies manifest reads. DECIDED.** Manifests are read by the back, not the browser. This
  removes the asymmetry that a customer-hosted marketplace could be reachable for installing (the back
  downloads tarballs) yet invisible for listing (the browser may lack CORS or network reach) — a failure
  that would be silent, since every manifest fetch already degrades to `[]`.
- **Optional HTTP Basic auth per marketplace. DECIDED.** A manifest carries only names and versions and
  *can* be public, but a marketplace may still choose to sit behind Basic auth. Credentials are optional
  per entry, attached by the back, and never sent to the browser. Password in `ISecrets`, never in
  `kwirth.settings` — see step A.

## Open questions

- **Trust.** Installing pulls a tarball from a URL the manifest supplies, so registering a marketplace is
  a privileged action: the `admin` scope gate exists, but decide whether anything validates what comes
  back. Can wait until C.
- **Whether install reuses the marketplace credentials.** If a marketplace is behind Basic auth, the
  tarball it points at probably is too. The install path would then need the same credentials the resolve
  path uses. Worth confirming before B so the credential lookup is shared rather than bolted on.
