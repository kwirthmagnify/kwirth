# Private Marketplace Manifests — Plan

## Status (2026-09-06) — ENTREGADO Y EN USO

Funcionando end-to-end contra un manifest privado real en GitLab. Registro de marketplaces en *Kwirth
settings → Marketplaces*, persistido server-side; resolución en el back (`MarketplaceManager`) con
precedencia por extensión y **sin mezclar versiones entre marketplaces**; procedencia estampada y visible
en las tarjetas de los once manager dialogs.

Cerrado en el CL9 del **2026-09-06** (ver `plans/test-metrics-history.md`):

- **Secretos**: contraseña del registro y token del manifest viven en `ISecrets`, nunca en el configmap de
  settings. Desde `common@0.5.44` viajan al formulario **pre-rellenados y enmascarados**, con ojo para
  revelar — el patrón de campo secreto del resto de Kwirth. Vaciar el campo borra el secreto guardado.
  Desaparece el endpoint de revelado bajo demanda, que ya no hace falta.
- **Identidad de la documentación**: `IMarketplaceEntry.targetType`. Una guía se identifica por el par
  `(targetType, id)`, porque su id es el de la extensión documentada y se repite entre tipos. La
  precedencia de `resolveEntries` va por ese par; para el resto de tipos, la clave sigue siendo el id.
- **e2e**: `marketplace-resolve` (procedencia y precedencia, robusto a que haya privados registrados) y
  `marketplace-secrets` (el campo secreto entero, con snapshot/restore de la configuración real).

**Los tres hosts de manifest, cerrados el 2026-09-06** (`common@0.5.45`): GitLab (`PRIVATE-TOKEN`), GitHub
(`Bearer` + el `Accept` del media type raw, que se manda siempre con comodín detrás) y Azure DevOps
(`Basic` con el PAT como contraseña, más `username` opcional en `IMarketplaceManifestAuth`). Documentados
en la guía de admin con la URL de API de cada uno.

⚠️ **GitHub se verificó contra la API real** (sin el `Accept` llega base64 envuelto en JSON; con él, el
manifest crudo). **Azure DevOps no se ha podido validar contra un servidor real** — la cabecera se
construye como documenta Azure y hay tests, pero la guía lo dice explícitamente y pide que lo reporten si
falla. Es lo pendiente de este apartado.

## Status inicial (2026-09-04) — NOT STARTED

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
  route, only validation of the list shape. Each entry: a stable `id`, the `url` of **one manifest**, a
  `label`, and an `enabled` flag.

  **One URL is one manifest, and it may mix extension types.** Every entry in every manifest already
  carries `extensionType` — verified across all seven populated public manifests, 416 entries, no
  exceptions — so entries are self-describing and each manager dialog simply filters by its own type. The
  folder split in the public layout (`plugins/manifest.json`, `senders/manifest.json`, …) is therefore
  redundant information, and a private marketplace does not have to reproduce it: one file listing a
  plugin, two senders and a theme works. A marketplace that prefers to split by type just registers
  several URLs.

  This also makes the fetch cheaper than the base-URL scheme would have: one request per marketplace
  instead of ten probes per marketplace, most of which would 404.

  **Basic auth credentials do NOT live here.** `kwirth.settings` is an unencrypted ConfigMap; passwords
  belong in `ISecrets`, which is AES-256-GCM encrypted on the filesystem backends and RBAC-protected in
  k8s. So the entry carries at most `auth: { type: 'basic', username }`, with the password stored in
  `ISecrets` keyed by the marketplace `id`. Two consequences the implementation must honour: `GET
  /core/settings` never returns the password — it returns a `hasPassword` boolean instead — and a PUT that
  omits the password leaves the stored one untouched rather than clearing it.

  **A private marketplace has the same shape as the public one:** a manifest on an open host (GitHub for
  the OSS marketplace) whose entries each carry the full tarball `url`, pointing at a package registry
  (npmjs for OSS). The package location comes from the manifest itself, exactly as today, so the entry
  needs no registry URL of its own. The first real target is a manifest on GitHub with packages on an
  **npm endpoint of a Sonatype Nexus**, which accepts Basic auth directly, so no token exchange.

  **Credentials are selected by provenance, not by URL matching.** Because the back resolves, it knows
  which marketplace served each entry — the same fact that feeds the provenance badge in C2. At install
  time the credentials used are those of the marketplace the entry came from. No prefix-matching a tarball
  URL against configured registries, and therefore no way to accidentally send one marketplace's
  credentials to another's host. An entry with no marketplace behind it (the public one, a hand-typed URL)
  installs with no credentials at all.

- **B — Back-side resolution behind one endpoint.** The back fetches each configured manifest once,
  filters by the requested `extensionType`, and applies the precedence of step D, exposing a single
  endpoint per extension type that returns the already-resolved list with provenance stamped on each
  entry. The ten dialogs and the update check consume that instead of fetching manifests themselves.

  Note the precedence of step D operates on what survives the type filter: two entries sharing an `id` but
  differing in `extensionType` are different extensions and must not shadow each other.

  Doing the resolution server-side rather than shipping a helper to the front buys two things: the
  precedence rule lives in one testable place instead of being re-applied in eleven, and it removes the
  asymmetry that motivated the proxy, since the back is already what downloads tarballs at install time.
  (Credentials are not a reason here — the manifest read needs none; they belong to the install path.)

  **Consequence worth flagging:** for the back to resolve, it needs every source, the public one included.
  The ten hardcoded public URLs therefore move from the ten dialogs into a single list in the back. They
  stay hardcoded and stay the OSS marketplace — this only deduplicates ten copies into one and is a
  side effect of proxying, not a change of policy.
- **C — UI.** Add/remove/enable rows in `SettingsKwirth`, with URL validation and a reachability test that
  fetches the manifest. Credentials cannot be verified by that test — they only come into play when
  downloading a package — so a wrong password would otherwise stay hidden until somebody tries to install.
  Worth having the test optionally pull the first entry's tarball headers to exercise them. The dialog
  already reads and writes `/core/settings` on its own, so this extends it rather than rewiring it. The
  password field is `type=password` with a visibility toggle, and renders as already-set (not blank) when
  `hasPassword` comes back true.

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
- **Optional HTTP Basic auth, on the package and not on the manifest. DECIDED.** The manifest carries only
  names and versions and is read openly, with no credentials. What can sit behind Basic auth is the
  **package** — the tarball an entry points at. So credentials are used by the *install* path, which is
  already back-side, and never by the manifest read. Password in `ISecrets`, never in `kwirth.settings` —
  see step A.

## Backlog: GitHub and Azure DevOps as manifest hosts

Manifest authentication ships supporting **GitLab only**. Someone hosting their manifest on GitHub or
Azure DevOps cannot register it yet, and each needs a distinct change — verified before writing any
guide, precisely so the guide does not document something that fails:

| Host | URL to register | Auth | Missing |
|---|---|---|---|
| GitLab | Files API `…/repository/files/<file>/raw?ref=<branch>` | `PRIVATE-TOKEN` header | — works |
| GitHub | Contents API `…/repos/<o>/<r>/contents/<path>?ref=<b>` | Bearer | `Accept: application/vnd.github.raw` |
| Azure DevOps | Items API `…/_apis/git/repositories/<r>/items?path=…&$format=text` | Basic, PAT as password | `EManifestAuthType.BASIC` |

- **GitHub** returns JSON with base64 content unless the raw media type is requested, so the fetch would
  be rejected as "not a list of extensions". Needs the `Accept` header — harmless to send elsewhere if it
  carries a `*/*` fallback, so it need not be per-host configuration.
- **Azure DevOps** authenticates PATs over HTTP Basic with the token as the password (username ignored),
  which the manifest auth types do not cover. Needs `BASIC` adding, plus an optional `username` on
  `IMarketplaceManifestAuth`.

Both touch `IMarketplace` in common, hence a publish cascade. Deferred to ride along with the next common
change rather than spending a cascade on its own (decision 2026-09-04). The admin guide documents GitLab
today; the CL9 note records that the other two are pending, so the guide is completed when they land.

## Open questions

- **Trust.** Installing pulls a tarball from a URL the manifest supplies, so registering a marketplace is
  a privileged action: the `admin` scope gate exists, but decide whether anything validates what comes
  back. Can wait until C.
