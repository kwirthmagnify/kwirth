# Provider Contract — provider-owned configuration — Plan

## Status (2026-09-06) — DONE, PUBLISHED AND VALIDATED LIVE

Core changes that let a **provider own its own configuration** — serve it, validate it and persist it —
instead of receiving an opaque blob from the core through `configure()`. It brings providers up to par with
**channels**, which have worked this way all along.

- **Green**: `tsc --noEmit` clean on `common-back` and `back`; back suite **176/176**, with 8 new tests for
  the injected provider storage (`back/tests/tools/providerStorage.test.ts`).
- **Published**: `@kwirthmagnify/kwirth-common-back` (0.5.37 at the time of this work; 0.5.40 at the time of
  writing), needed so an external provider can *compile* against the new contract.
- **Validated live** against the dev core by **two independent providers**, one of them in this repo
  (`http-pull-push`, see `plans/http-pull-push/PLAN.md`): `configRouter` mounted and answering **403 without
  an accessKey**, serving `GET`/`PUT` with one, hot-apply taking effect with no restart, and the
  sensitivity split landing in real Kubernetes objects — the ConfigMap holding the non-sensitive fields and
  the Secret the credentials, with **zero occurrences of the credential in the ConfigMap**.

## Why the core had to change

Findings from the code as it was:

- A provider's constructor took exactly `(clusterInfo, kwirthData)` ([back/src/providers/IProvider.ts:7](../../back/src/providers/IProvider.ts#L7)).
  Neither carries storage: `ClusterInfo` is Kubernetes APIs + nodes + providers, `KwirthData` is a flat DTO.
- `writeStorage`/`readStorage` lived only in `IBackChannelObject` ([common-back/src/IBackChannelObject.ts:6-9](../../common-back/src/IBackChannelObject.ts#L6-L9)),
  built at [back/src/index.ts:1744](../../back/src/index.ts#L1744) and handed **only to channels** via
  `createChannelInstance(ChannelClass, clusterInfo, backChannelObject)`. Providers never saw it.
- Channels get their HTTP endpoints **authenticated by the core** ([back/src/index.ts:1318-1344](../../back/src/index.ts#L1318-L1344)):
  the core mounts one router per declared endpoint and runs `AuthorizationManagement.validKey` before
  calling the channel. Providers had no equivalent — their routers are mounted raw
  ([back/src/index.ts:1400-1420](../../back/src/index.ts#L1400-L1420) and [:1301-1303](../../back/src/index.ts#L1301-L1303)).
- A provider was only instantiated if some channel required it, or if it had a public router
  ([back/src/index.ts:1639](../../back/src/index.ts#L1639), [:1669](../../back/src/index.ts#L1669)).
  With no public router and no subscriber yet **there was no live instance** — which is precisely the moment
  an administrator configures it for the first time.

Existing public provider routers (business `/business`, otel `/otlp`, validating `/validating`) receive
**external** traffic (OTLP exporters, third-party POSTs) and cannot demand a Kwirth accessKey. So the
management endpoints had to be a **separate, always-authenticated path**, not a blanket rule over the
existing router.

## What was considered and rejected

Two models were on the table before settling. Recorded because the reasoning is what makes the result
defensible:

- **Core-owned config (the `configure()` path)** — cheaper (two core changes instead of seven), but it
  consolidates a mechanism *different from the one channels use*, and it cannot let a provider decide that
  one field is a credential and belongs in a Secret: the core stores the whole blob in a ConfigMap. It was
  also barely exercised — only syslog used it, and its dialog calls the wrong URL, so in practice nobody had.
- **A provider router with its own auth** — rejected because a provider would be reimplementing
  `validKey` (bearer keys signed against `masterKey`, expirations, refresh), duplicating security logic
  inside an artifact. The core already knows how to do this for channels; it just had to do it for providers.

Note that **hot-apply is the provider's job in either model** — reconciling what is running after a save is
the provider's code. What changed is who tells it: the core calling `configure()`, or the request landing
on its own router.

## Changes

| # | Change | File | Done |
|---|---|---|---|
| 1 | `IProvider` gains `configRouter?: Router` — management endpoints, always mounted behind `validKey`. `configure()` marked `@deprecated` | `common-back/src/IProvider.ts`, `back/src/providers/IProvider.ts` | ✔ |
| 2 | New `IProviderStorage` (`writeStorage`/`readStorage`/`writeStorageCommon`/`readStorageCommon`) | `common-back/src/IProvider.ts`, `back/src/providers/IProvider.ts` | ✔ |
| 3 | `TProviderConstructor` + `createProviderInstance` gain an **optional third parameter** `storage` (the existing providers keep compiling untouched) | `back/src/providers/IProvider.ts`, `common-back/src/IProvider.ts` | ✔ |
| 4 | Provider-scoped storage, prefix `kwirth-store-provider-<id>`; the *Common* variants keep the shared `kwirth-store-common-` namespace | `back/src/tools/ProviderStorage.ts` (new), wired at `back/src/index.ts` | ✔ |
| 5 | Pass `storage` at the three instantiation sites | `back/src/index.ts` :1288, :1641, :1671 | ✔ |
| 6 | `mountProviderConfigRouter()` mounts `configRouter` at `/core/providerconfig/<id>` behind `validKey`, called from the two sites where provider routers are mounted | `back/src/index.ts` | ✔ |
| 7 | Auto-instantiate providers declaring a `configRouter`, not just those with a public router — otherwise the dialog has nothing to talk to before the first subscriber | `back/src/index.ts` | ✔ |
| 8 | Unit tests for the injected storage (destination per `secret` flag, namespaces, round-trip, no collisions) | `back/tests/tools/providerStorage.test.ts` (new) | ✔ |
| 9 | `getConfigNames?(): string[]` — optional, mirroring `ISender.getConfigNames`. `ProviderApi` surfaces it as `configNames` in the provider listing (read defensively, like `subscriptionHelp`) and the manager shows a `N configs` chip next to the gear, as it does for senders | `common-back/src/IProvider.ts`, `back/src/providers/IProvider.ts`, `back/src/api/ProviderApi.ts`, `front/src/components/ProviderManagerDialog.tsx` | ✔ |

Design decisions inside those changes:

- **Management path `/core/providerconfig/<id>`**, chosen over `/core/providers/<id>/manage` to avoid
  overlapping with the `ProviderApi` mount.
- **Storage prefix `kwirth-store-provider-<id>`**, mirroring the channels' `kwirth-store-channel-`. Verified
  by test not to collide with the channel namespace nor with the core-managed `kwirth-provider-<id>-config`.
- The *Common* variants deliberately keep the **shared** `kwirth-store-common-` namespace: that is the store
  channels and the AI configuration already use, and sharing is the point of it.

## `configure()` is deprecated, not removed

Nothing in this repo feeds it any more. But `/core/providers/:id/config`, `getSchemaAsync` and the
schema-driven generic dialog are **public contract** and third-party providers may rely on them, so they
stay functional and simply stop being used. Documented as deprecated — with the reasons — in
`docs/<ver>/providers/developing.md`.

The generic schema-driven dialog also stays as-is: it is still the right answer for a provider whose
configuration really is a handful of flat fields.

## Publish cascade — exception

> **EXCEPTION, agreed with the user: the publish cascade was skipped** for the `common-back` release that
> carried this contract. Its ~30 dependents were not bumped/rebuilt/republished. The change is additive and
> type-only, no existing artifact needs it, and they all declare `^0.5.x`, so a clean install already
> resolves to the new version. Only the artifacts that actually use the new contract raise their dependency.
> **The cascade rule stays in force for every other publish.**

## Pending — migrate syslog

`syslog` is the only provider left on the old model, and it is **broken today**, so this is a fix as much as
a migration. Two independent faults:

- Its dialog calls `${backendUrl}/providers/syslog/config` instead of `/core/providers/...`, so the config
  never loads and never saves ([SyslogConfigDialog.tsx:33](../../providers/syslog/src/front/SyslogConfigDialog.tsx#L33)).
- With an empty ConfigMap the core skips `configure()` ([back/src/index.ts:1645](../../back/src/index.ts#L1645))
  and `startProvider()` throws `syslog provider has no configuration`, so a fresh install cannot start.

Work:

- Drop `configure()`; add a `configRouter` with `GET/PUT /config` and read the config from storage on start.
- Persist with `writeStorage('syslog-config', false, …)` — no credentials involved, so no split needed.
- Point the dialog at `/core/providerconfig/syslog/config`.
- Sensible defaults so a fresh install starts instead of throwing (port 514, protocol both).
- Bump + build + publish (OSS: public npm + public manifest), and re-check its guide page.

Deprioritised by the user (syslog is not in use), so it runs after the `http-pull-push` block.
