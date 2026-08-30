# Webhook Extension Type — Plan

## Status (2026-08-30) — SHIPPED & VALIDATED (webhook + full ticketing block)

The `webhook` extension type is **live and validated end-to-end**, and the Excubitor ticketing integration
is complete and validated live (Jira Cloud round-trip), including the H3b follow-ups. Published:
`@kwirthmagnify/kwirth-common@0.5.38`, `@kwirthmagnify/kwirth-common-back@0.5.32`.

**H3b follow-ups — DONE & VALIDATED (2026-08-30):**
- **remstate** — configurable *ticket status → remediation state* mapping (`statusMap`), applied on callback
  under mutex, with the `verified` shield (scanner-only truth). `sender fetchStatus` not involved here.
- **recon** — `ISender.fetchStatus?` + `SenderManager.fetchStatus`; Excubitor reconciles open tickets on
  **startup** (recovers callbacks missed while the core was down). Sender `jira` implements `fetchStatus`.
- **lifecycle** — durable `excubitor_ticket_event` history (id survives) → the finding's *Status* timeline
  always carries the ticket id; the `ticket_link` is **purged on `verified`**. Idempotent/atomic
  `updateStatusByIssueKey` kills the duplicate-callback flood.
- **assign** — *assign a person* and *open a ticket* **decoupled** (one dialog, both optional; same
  `findingedit` scope): owner-only / ticket-only / both.
- Paid: `sender/jira@0.1.2`, `webhook/jira@0.1.1`. Plugin `plugin/excubitor@0.1.184`.
- Also (side task): the fullscreen AppBar shows the **home URL in red** when the socket drops (Iter UX).

- **Streams 1 (senders return) + 3 (webhook system) — DONE.** `EExtensionType.WEBHOOK`, contracts,
  `WebhookManager` (token registry + persistence), raw-body receiver at `…/webhook/<provider>/<token>`,
  `WebhookApi` (`/core/webhooks` + url/rotate), `WebhookManagerDialog`. Unit tests (WebhookManager +
  WebhookReceiver) + a front e2e (`front/e2e/tests/webhooks.spec.ts`) + guide
  (`docs/…/guide/extensions/webhooks`). Live E2E: Jira Cloud → cloudflared → receiver → verify → parse → 200.
- **`jira` sender + `jira` webhook — DONE (paid, private repos).**
- **⚠️ DESIGN CHANGE — consumer-driven (provider-like).** A webhook config has **no `target`**. Delivery is
  by **subscription** (like `addSubscriber('events'…)` / `processProviderEvent`). A consumer subscribes at
  startup and receives that webhook's events; non-subscribers get nothing. The dialog has no target selector.
- **⚠️ DESIGN REFINEMENT (0.5.37/0.5.31) — STRICT PAIR (webhookId, configName).** Webhooks are general to all
  of Kwirth (several configs/consumers of the same type may coexist), so subscription is to a **specific
  config**, not the whole type: `subscribe(webhookId, configName, consumer)` + `deliver(webhookId, configName,
  event)`. The receiver **stamps `IWebhookEvent.configName`** (resolved from the URL token); `IWebhook.parse()`
  returns `Omit<IWebhookEvent,'configName'>` (the artifact doesn't know its config name). Excubitor ticketing
  now pins `webhookId` **+** `webhookConfigName` (four paired selectors in the Ticketing tab, mirroring
  sender+config).
- **Stream 5 (Excubitor ticketing integration) — DONE & VALIDATED.** Assign → create ticket via the sender →
  `ticket_link` (HOME Postgres) → subscribe to the paired webhook config → reflect status on the finding.
  Live E2E OK. Bug fixed during QA: `ExcubitorChannel.cleanup()` now unsubscribes from the webhook (hot-reload
  zombies otherwise received the event with 0 connections). Tracked in the Excubitor backlog (H3b + follow-ups
  H3b-recon / H3b-assign / H3b-remstate).

## Overview

New first-class Kwirth extension type **`webhook`**: a reusable **inbound HTTP ingestion** artifact — the
**inbound counterpart of `sender`** (senders are outbound, one-directional; webhooks are inbound). A webhook
artifact knows how to **verify** and **parse** a specific provider's callbacks (Jira, ServiceNow, GitHub,
Alertmanager, …) and hands a **normalized event** to a **consumer** extension (a channel/plugin).

Driving use case: **Excubitor ↔ ticketing** (H3b). Excubitor pushes a ticket on finding-assign, and the
ticketing system calls back on state changes; that callback enters through a `webhook` extension bound to the
Excubitor channel. See [`plugins/excubitor/docs/plan/h3-integrations-plan.md`](../../plugins/excubitor/docs/plan/h3-integrations-plan.md).

This is a **core/platform** feature (open-source repo). It must exist before Excubitor's ticketing connector
consumes it. Together, `sender` (out) + `webhook` (in) + a per-config binding = a **bidirectional connector**.

---

## Concept & addressing

The unit is **an instance of ingestion with its own URL + a binding to a consumer** — NOT "one webhook per
provider". Many instances of the same provider can coexist; the emitter (e.g. Jira) decides which one it hits
because you paste that instance's URL into its outbound config.

**Mounted URL:**

```
{host}{envRootPath}/webhook/<provider>/<opaque-token>
                     │          │           │
                     │          │           └─ per-config random token: routes AND authenticates (capability URL)
                     │          └─ webhook extension id (jira | servicenow | …): selects parser/verifier
                     └─ fixed segment for the type
```

- **Between two consumers (e.g. plugin A and plugin B both taking Jira callbacks):** two **config instances**,
  two **tokens** → `webhook/jira/xxxx` (→ A) and `webhook/jira/yyyy` (→ B). Routing is by token, decided at
  config-creation time (when the core hands out the URL), never by sniffing the payload.
- The `<provider>` segment is organizational/readability; the **token alone** is sufficient for routing (the
  core's token registry maps `token → {webhookId, configName, target, secret}`).

**Security rationale:** the receiver is unauthenticated at the Kwirth layer (`requiresAccessKey:false`) — the
emitter has no Kwirth access key. So the **opaque token is the routing barrier and a bearer capability**, and
the provider's **signature/HMAC or shared secret** verification runs on top (defense in depth). Token must be
CSPRNG (`crypto.randomBytes`), non-enumerable, rotatable.

---

## Package structure (the artifact)

Mirrors a sender artifact (`senders/console/`). Back-only + optional config schema/front (reuse the generic
config UI; no bespoke front required for V1).

```
webhook-jira.tgz
├── package.json      ← manifest, targetType: "webhook"
├── back.js           ← the IWebhook implementation (esbuild bundle, export default)
└── front.js          ← optional (config schema is served from back via getConfigSchema())
```

`package.json` (mirror `senders/console/package.json`, `targetType` per the `login` precedent in
`plans/login-extensions/PLAN.md`):

```json
{
  "id": "jira",
  "name": "jira",
  "displayName": "Jira Webhook",
  "publisher": "@kwirthmagnify",
  "version": "0.1.0",
  "description": "Ingests Jira Cloud issue webhooks",
  "type": "module",
  "targetType": "webhook",
  "requiresRestart": false,
  "requiresExtension": []
}
```

---

## Contracts

### Shared — `common/src/Webhook.ts` (NEW, mirror `common/src/Sender.ts`)

```ts
// Normalized event a webhook hands to its consumer. Provider-agnostic.
export interface IWebhookEvent {
    provider: string          // webhook id, e.g. 'jira'
    kind: string              // normalized event kind, e.g. 'issue.updated' | 'issue.transitioned'
    externalId: string        // provider entity id, e.g. issue key 'SEC-42'
    status?: string           // normalized status if applicable, e.g. 'Done'
    receivedAt: string        // ISO
    headers?: Record<string, string>
    raw: unknown              // original parsed payload (for consumer-specific needs)
}

export interface IWebhookConfig { name: string; target: string; [key: string]: unknown }  // target = consumer id
export interface IWebhookStoredConfig { configs: IWebhookConfig[]; [key: string]: unknown }

// Handle the core injects into consumers (mirror ISenderAccess). A consumer subscribes to events
// addressed to it; the core delivers verified+parsed events.
export interface IWebhookAccess {
    subscribe(target: string, consumer: IWebhookConsumer): void
    unsubscribe(target: string, consumer: IWebhookConsumer): void
    listWebhooks(): Array<{ id: string; provider: string; configNames: string[] }>
    getUrl(webhookId: string, configName: string): string | undefined   // full public URL incl. token
    rotateToken(webhookId: string, configName: string): string          // new token → new URL
}

export interface IWebhookConsumer { processWebhookEvent(event: IWebhookEvent): void }
```

### Back — `common-back/src/IWebhook.ts` (NEW, mirror `common-back/src/ISender.ts`)

```ts
export interface IWebhook {
    readonly id: string                 // provider id, e.g. 'jira'
    // Verify authenticity from RAW bytes + headers + the RESOLVED config (incl. secret fields).
    // AUTH IS ARTIFACT-OWNED: the core is agnostic. Jira compares headers.authorization to config.apiKey;
    // GitHub computes an HMAC over rawBody with config.hmacSecret; each artifact decides. The core just
    // hands the raw body + headers + config and trusts the boolean.
    verify(rawBody: Buffer, headers: Record<string,string|string[]|undefined>, config: IWebhookConfig): boolean
    // Parse raw bytes into the normalized event (after verify passes).
    parse(rawBody: Buffer, headers: Record<string,string|string[]|undefined>): IWebhookEvent | null
    // The artifact declares its OWN config fields (apiKey, header name, hmac secret, project key…) — the core
    // renders them generically and stores them; it does not know their meaning.
    getConfigSchema?(): { fields: IWebhookFieldDef[] }   // mirror ISenderFieldDef (text|number|boolean|password|select|json)
    startWebhook?(access: IWebhookAccess): void
    stopWebhook?(): void
    // config CRUD (mirror ISender): addConfig/removeConfig/hasConfig/getConfigNames
}
export type TWebhookConstructor = new () => IWebhook
```
Re-export from `common-back/src/index.ts` (next to `ISender`).

---

## Core changes (all grounded in the existing sender/provider plumbing)

| # | Change | File(s) | Mirror of |
|---|---|---|---|
| C1 | Add `WEBHOOK = 'webhook'` to the enum | `common/src/ExtensionType.ts:7-17` | existing values |
| C2 | Shared contract | `common/src/Webhook.ts` (NEW) | `common/src/Sender.ts` |
| C3 | Back interface + re-export | `common-back/src/IWebhook.ts` (NEW), `common-back/src/index.ts` | `common-back/src/ISender.ts` |
| C4 | **WebhookManager** (load bundles, constructor Map, config store, **token registry**, secret store, persistence) | `back/src/tools/WebhookManager.ts` (NEW) | `back/src/tools/SenderManager.ts` |
| C5 | Front API `/core/webhooks` (list/install/upload/configs CRUD/schema/front) **+ `GET /:id/configs/:name/url` and `POST …/rotate`** | `back/src/api/WebhookApi.ts` (NEW) | `back/src/api/SenderApi.ts` |
| C6 | **Inbound receiver route** at `${envRootPath}/webhook/<provider>/<token>` with **RAW body** middleware | `back/src/index.ts` | channel endpoint mount `:1259-1286` + `SenderApi` raw `/upload` |
| C7 | Instantiate manager + mount API + inject access handle | `back/src/index.ts` (`prepareRunningInstance` ~`1630`; API mount ~`1308`; inject ~`1746/1749`) | SenderManager wiring |
| C8 | `webhooks?: IWebhookAccess` on the injected objects | `common-back/src/IBackChannelObject.ts:20`, `back/src/model/ClusterInfo.ts:54` | `senders?: ISenderAccess` |
| C9 | RouteRegistry reservation for the `webhook` base + token uniqueness | `back/src/tools/RouteRegistry.ts` | provider/channel reservations |

### C6 — the crux: RAW body

The core registers `app.use(bodyParser.json())` **globally** at `back/src/index.ts:2445`, **before** the
active-instance dispatcher (`:2458-2468`). So handlers normally get `req.body` already JSON-parsed → **the raw
byte stream needed for HMAC verification is lost**.

**Solution:** mount the webhook receiver **before** the global JSON parser, with its own raw middleware:

```ts
// BEFORE app.use(bodyParser.json()) at ~2445
expressApp.use(`${envRootPath}/webhook`, express.raw({ type: '*/*', limit: '1mb' }), webhookReceiver)
```

`webhookReceiver` (Router): path `/:provider/:token` →
1. `WebhookManager.resolve(token)` → `{ webhookId, configName, target, config }` (404 if unknown).
2. `webhook.verify(req.body /*Buffer*/, req.headers, config)` → 401 on failure. **The auth scheme (Authorization
   header, `X-Api-Key`, HMAC…) is NOT a core-general setting — it is config SPECIFIC TO EACH webhook type,
   declared by the artifact and interpreted only inside its own `verify()`.**
3. `webhook.parse(req.body, req.headers)` → `IWebhookEvent` (400 if unparseable).
4. Deliver to every consumer subscribed for `target`: `consumer.processWebhookEvent(event)`.
5. `200 OK` fast (ack before heavy work; consumers process async).

Precedent for opt-in raw body: `SenderApi.ts:43` (`raw({type:'application/octet-stream'})`).

### Internal delivery (webhook → consumer)

Mirror the provider→channel subscriber pattern (`ClusterInfo.addSubscriber` + `IChannel.processProviderEvent`,
`back/src/model/ClusterInfo.ts:60-82`). Here the consumer **subscribes itself** through the injected access
handle: in its `startChannel`, `this.backChannelObject.webhooks?.subscribe('excubitor', this)`, and implements
`processWebhookEvent(event)`. The manager keeps `Map<target, IWebhookConsumer[]>` and fans out on a verified
event. Manager is per-running-instance (like `SenderManager`) → delivers to channels in the same instance (the
home). No cross-instance hop needed: the webhook config and its consumer live on the home.

### Config, secrets, token lifecycle

- Persist configs to configmap namespace `kwirth-webhook-configs` keyed by webhookId (mirror `SenderManager`
  `kwirth-sender-configs`, `:467-474`). Bundle bytes gzip+base64 in `kwirth-webhook-<id>-{back,front,meta}`,
  index in `kwirth-webhooks-index`.
- **Secret** (provider shared secret / HMAC key) stored via the secret twin store (base64 in secrets, like
  `backChannelObject.writeStorage(secret:true)`), never returned to the front in clear (password field + eye
  toggle on the way in only).
- **Token** generated by the core on config create (`crypto.randomBytes(24).toString('base64url')`), stored with
  the config, surfaced to the front via `GET /:id/configs/:name/url`; `POST …/rotate` mints a new one
  (invalidates the old URL). The token is the routing key in the manager's registry.

### Front UX

Reuse the generic sender-style config UI (schema-driven from `getConfigSchema()`). Add, per config:
- **Target** selector (which consumer extension receives events).
- A read-only **Webhook URL** field with **copy** button + **Regenerate** (rotate) — this is the URL the user
  pastes into Jira/ServiceNow. Show a warning that rotating breaks the existing emitter config.
- Secret field = `password` + Visibility eye toggle (project rule).

README shipped with the artifact (project rule): description, config fields, provider setup steps.

---

## Security contract (enforced by the type, not each consumer)

1. Receiver is **unauthenticated at Kwirth layer** by design; **token** (capability URL) + **provider
   verification** (HMAC/secret) are mandatory. A webhook with no `verify` must be rejected at load.
2. **Raw body** is handed to `verify`/`parse`; the core does not JSON-parse it first.
3. **Ack fast, process async**; never block the HTTP response on consumer work.
4. Rate-limit per token; drop oversized bodies (`limit`); optional anti-replay (timestamp/nonce) left to the
   provider `verify`.
5. Token rotation + config delete → immediate registry eviction.

---

## Layer 2 — Excubitor ticketing on top (the driving use case, separate work)

Once the `webhook` type exists, Excubitor's H3b becomes:
- **`webhook-jira` artifact** (NEW, in `senders/`-style dir, e.g. `webhooks/jira/`): implements `IWebhook` for
  Jira Cloud (verify shared-secret header for V1; parse `issue.*` → `IWebhookEvent{externalId=issueKey,status}`).
- **Excubitor push** (unchanged from H3b plan): on finding-assign, `POST /rest/api/3/issue`; store `ticket_link`
  (`provider, cluster_uid, finding_key, issue_key, issue_url, last_status`) in the **home** Postgres.
- **Excubitor consume**: `subscribe('excubitor', this)` + `processWebhookEvent(e)` → find `ticket_link` by
  `e.externalId` → update `last_status`. V1 reflect informational; "resolved ⇒ remediated" mediated by front / V2.
- **Excubitor UI**: show ticket status + link on the finding; connector config (site, API token, project key)
  lives in Excubitor; the **webhook URL/secret** lives in the webhook config (core), bound `target: excubitor`.

Excubitor is a paid artifact → its parts follow the paid flow; the **webhook type + a generic/`jira` webhook
artifact are core/open-source**.

---

## Streams / phases (each an MVP; validate before next)

The overall effort is split into 5 streams. **Only the CORE streams (1 and 3) live in this open-source plan**;
the provider artifacts and the Excubitor integration are **paid** and tracked in the private Excubitor backlog
(no detail here, per the paid-artifacts rule).

- **Stream 1 · Adapt senders — DONE (published):** `send()` → `Promise<ISenderResult | void>` so a sender can
  return data to the caller. `common/Sender.ts` (`ISenderResult`), `common-back/ISender.ts`, `SenderManager`.
  Backward-compatible (`void` still valid); existing senders untouched. Shipped in
  `@kwirthmagnify/kwirth-common@0.5.33` + `@kwirthmagnify/kwirth-common-back@0.5.26`.
- **Stream 3 · Webhook system (core):** C1-C9 above — enum, `common/Webhook.ts`, `common-back/IWebhook.ts`,
  `WebhookManager` (token registry + config + secrets), `WebhookApi` (`/core/webhooks` + url/rotate), raw-body
  receiver `webhook/<provider>/<token>`, delivery via `subscribe`/`processWebhookEvent`, front config UI.
  Validated E2E with a trivial echo webhook artifact + a stub consumer.
- **Streams 2, 4, 5 (paid — private backlog):** provider artifacts (`jira` sender that returns `{issueKey,url}`,
  `jira` webhook) and the Excubitor assign integration. Detailed in the Excubitor private plan, not here.

---

## Open questions / risks

- **Mount ordering vs `bodyParser.json()`** (`:2445`): must register the raw webhook route earlier; verify no
  other global middleware consumes the body first. Prototype in W3.
- **Which running instance owns the webhook** in multi-instance setups: for Excubitor the home instance owns
  config + consumer, so local delivery suffices. Confirm the manager lives on the same runningInstance as the
  target channel (it does, mirroring SenderManager). Cross-instance delivery = out of scope V1.
- **RouteRegistry**: `webhook` base path reservation + guaranteeing token uniqueness across configs/providers.
- **Provider `verify` variance**: Jira Cloud has no built-in HMAC on Automation "Send web request" → the `jira`
  artifact uses an **API key in `Authorization`** (compared to its config `apiKey`); GitHub/Stripe-style HMAC
  comes with those artifacts later. The core supports both **because it does not know the scheme** — it passes
  the resolved `config` to `verify()` and each webhook type defines its own auth fields + logic.
- **Token in URL** is a bearer secret → HTTPS mandatory; keep tokens out of logs.
