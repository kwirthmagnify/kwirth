# HTTP Pull-Push Provider — Plan

New **OSS** provider `http-pull-push`: polls remote HTTP endpoints on a schedule and pushes each result to
the channels subscribed to it. It is the **pull** counterpart of Business/OTLP, for data sources that cannot
push into Kwirth by themselves.

> **Prerequisite:** the provider-owned configuration contract in the core — see
> [`plans/provider-contract/PLAN.md`](../provider-contract/PLAN.md). That plan carries the core changes
> (`configRouter`, injected `IProviderStorage`), the `configure()` deprecation and the syslog migration.
> Requires `@kwirthmagnify/kwirth-common-back >= 0.5.37`.

## Status (2026-09-06) — BACK, FRONT AND DOCS DONE AND VALIDATED LIVE; RELEASE PENDING

- **Back** — green: typechecks, builds `dist/back.js`, suite **44/44** (config split, poller, two-layer
  behaviour, validation). README done.
- **Front** — green: master-detail `ConfigDialog` with conditional fields, secret fields with an eye toggle,
  header editor. Typechecks and builds `dist/front.js`. Registered in `back/kwirth-dev.json`.
- **Validated live (2026-09-06)** — e2e `front/e2e/tests/provider-http-pull-push.spec.ts`, green,
  non-destructive (snapshot + restore, `e2e-hpp-` prefix). Against the dev core it proves: 403 without an
  accessKey; `GET`/`PUT` served through `/core/providerconfig/http-pull-push/configs`; a connection created
  by API is read back whole with its credential recomposed from the Secret; a bad url is rejected by the
  **back** with 400, not only by the dialog; the gear loads **its own** dialog (not the generic schema
  form), which lists the connection, paints its values and keeps the password masked until the eye reveals
  it. Separately verified on real Kubernetes objects in namespace `kwirth`:
  `configmap/kwirth-store-provider-http-pull-push-configs` holds the url and **not** the token, while
  `secret/kwirth-store-provider-http-pull-push-creds` holds the token.
- **Docs** — written: guide page, technical reference, rows in the three indexes, both `_sidebar.md`
  sections, and a card in the public `docs/providers.html`.
- **Pending: `providers/manifest.json` + npm publish.** Left out on purpose — the manifest entry points at a
  tarball URL, so it only makes sense once published. Waiting on the user's validation.
- Note: the dev core must be restarted to pick up a newly registered dev provider (`loadDevProviders` runs
  at startup).

## Overview — two layers

The provider has **two independent configuration layers**. They never mix.

**Layer 1 — connections (provider-owned, persisted).** Entries created from the provider's dialog, each
with an `enabled` flag. They exist even when no plugin is installed, and they are what actually performs
the HTTP pull.

| name | url | interval | enabled |
|---|---|---|---|
| `rss` | `https://…/feed.xml` | 300s | yes |
| `stocks` | `https://api…/quotes` | 60s | yes |
| `news` | `https://api…/news` | 900s | yes |

**Layer 2 — subscriptions (channel-owned, in memory).** Declared by each channel when subscribing:

```ts
XX → addSubscriber(this, { configs: ['stocks', 'rss'] })
YY → addSubscriber(this, { configs: ['stocks', 'rss', 'news'] })
```

**Flow.** The `stocks` poller fires every 60s → **one single GET** to the remote endpoint (never one per
subscriber) → the result is wrapped in an envelope → delivered to XX and YY. `news` (900s) reaches only YY.

## Design decisions (closed)

| Decision | Value | Why |
|---|---|---|
| Config ownership | The **provider** owns it (its own `configRouter` + injected storage) | Matches what channels do; the alternative (core-owned opaque config via `configure()`) cannot split credentials into a Secret. Full reasoning in the provider-contract plan |
| Event shape | `{ config, timestamp, status, data }`, `{ config, timestamp, error }` on failure | `processProviderEvent(providerId, obj)` carries no config identity: without the envelope a subscriber to several connections cannot tell the streams apart |
| Subscription | `{ configs: string[] }`; `[]` = nothing, absent = all enabled | User's call: an explicit empty array must not be read as "everything" |
| Polling | **Lazy** — a poller runs only while it has at least one subscriber | No traffic against endpoints nobody listens to; no quota burnt by a forgotten connection. `enabled` means "available for subscription" |
| Disabled connection | Persisted and listed, no timer, no emission | Disabling is layer 1: subscribers stop receiving it without touching their subscription |
| Credentials | Split in code: secrets → Secret, rest → ConfigMap | Same criterion channels use (`montag-configs` in a ConfigMap, provider credentials in a Secret) |
| Hot-apply | Yes, natively | The provider owns the write path, so it reconciles pollers right after saving. No restart, no `configure()` |
| Scope | Full per connection | Method, headers, body, interval, timeout, auth, responseType, emitMode, retries, TLS |
| `PUT /configs` | Replaces the **whole list** | Simpler, and matches how montag/censor save their `*-configs` — no per-item POST/PUT/DELETE |

## Back

`providers/http-pull-push/`, modelled on syslog (front + back) and business (tests).

- `providesRouter = false` (no external traffic), `configRouter` with the management endpoints:
  - `GET /configs` — the list, credentials included (the caller is already authenticated by the core).
  - `PUT /configs` — validates, replaces the list, splits and persists, reconciles pollers **in place**.
- Persistence, split by sensitivity in code:
  - `writeStorage('http-pull-push-configs', false, …)` → ConfigMap: names, urls, intervals, headers, flags.
  - `writeStorage('http-pull-push-creds', true, …)` → Secret: basic password, bearer token, header value.
  - Own store, not the *Common* one: these credentials are not shared with other extensions.
- On start: reads both and merges. No `configure()` involved.
- Scheduler: one poller per enabled connection **with at least one subscriber**; started on the first
  subscriber, stopped when the last one leaves, recreated when its parameters change (compared by a
  fingerprint, so a reordered headers object does not needlessly restart it and lose the `onChange` state).
- The HTTP call uses the native `http`/`https` modules, **not `fetch()`**: it gives per-request timeout and
  `allowInsecureTls` (`rejectUnauthorized`) with zero dependencies, and the fetcher is injected so tests
  never touch the network.
- A cycle is **skipped** while the previous one is still in flight: the interval sets the pace, not the
  latency of a slow endpoint.
- After a failure, the next good result is emitted even in `onChange` mode, so a subscriber sees the
  recovery instead of being left with the error as the last word.
- A subscriber asking for an unknown or disabled connection: ignored, logged, never a failed subscription.
- Enums in `src/common` (shared back↔front), no string literals.

Tests (`node:test` + esbuild, business' runner): lazy start/stop by refcount, credential split and merge,
envelope shape, `onChange` suppression, retries, error envelopes, overlap protection, disabled connection
never emits, and the two-layer selection semantics.

## Front

`ConfigDialog` registered on `window.__kwirth_providers__['http-pull-push']`, loaded by the provider
manager's gear ([front/src/components/ProviderManagerDialog.tsx:534](../../front/src/components/ProviderManagerDialog.tsx#L534)).

**Why a custom front and not the generic schema-driven dialog.** The generic one renders a flat form for a
single object, with field types `string | number | boolean | password` — it cannot represent a list of N
connections, let alone nested objects. And most of this UI is conditional: `auth` (none/basic/bearer/header)
decides which credential fields exist, `method` decides whether there is a body, `responseType` decides how
`onChange` compares, insecure TLS only makes sense on `https://`, and a disabled row dims the rest. Add
cross-field validation (timeout longer than the interval, duplicate names) and a master-detail layout, and
the generic dialog is out of the question.

- Connection list with add/edit/delete and an enable toggle.
- Secret fields as `type=password` with a Visibility toggle.
- Validation shared with the back (`src/common/Validation.ts`): applied before sending, and the back's 400
  errors are rendered the same way.
- Talks to `${backendUrl}/core/providerconfig/http-pull-push/configs`.
- Fixed dialog size, Cancel on the right, English UI.

> The syslog dialog has the bug we must not repeat: it calls `${backendUrl}/providers/syslog/config`
> ([SyslogConfigDialog.tsx:33](../../providers/syslog/src/front/SyslogConfigDialog.tsx#L33)) while the
> endpoint is mounted at `/core/providers/...`. Fixed as part of the provider-contract plan.

## Docs and release

- `docs/<ver>/guide/extensions/providers/http-pull-push.md` + row in that section's `index.md`. ✔
- `docs/<ver>/providers/reference/http-pull-push.md` + rows in `providers/index.md` and
  `providers/reference/index.md`. ✔
- Both `_sidebar.md` sections + a card in the public `docs/providers.html`. ✔
- `README.md` in the provider (description, config, examples). ✔
- `back/kwirth-dev.json`. ✔
- **Pending**: `providers/manifest.json` + provider `bbpm` (OSS: public npm + public manifest).
- **Pending**: closing checklist (9 points), including `plans/test-metrics-history.md`.
