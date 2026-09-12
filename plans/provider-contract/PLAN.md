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

---

## BUG PENDIENTE (2026-09-11): un provider instalado en caliente no monta su `configRouter`

Detectado al preguntarse por qué un provider dueño de su configuración tiene que declarar
`requiresRestart: true`. La respuesta es un hueco del cableado, no una limitación necesaria.

El `configRouter` solo se engancha en **dos** sitios:

| Dónde | Cuándo corre |
|---|---|
| `back/src/index.ts:1483` | Al **arrancar**, recorriendo los providers vivos |
| `back/src/index.ts:1365` | Al instalar **un plugin** en caliente, para los providers que ese plugin declara en `requiresExtension` |

No hay un tercero. `ProviderApi` define el callback `onProviderInstalled` y lo invoca en sus dos rutas de
instalación (`/install` y `/upload`), pero **`index.ts` no lo implementa**: queda `undefined` y no pasa
nada.

**Consecuencia:** instalar un provider **por su cuenta** desde el marketplace deja su ruta sin montar. El
diálogo se pinta igual —el front se sirve aparte— y todo lo que el usuario haga responde `HTTP 404`.

**Y el síntoma es peor de lo que parece, porque es intermitente:** si en vez del provider se instala el
**plugin** que lo requiere, esa otra ruta sí lo instancia y sí monta el router. O sea que el mismo
producto funciona en caliente o no según por dónde entre el usuario, sin nada que se lo explique.

**Arreglo:** implementar `onProviderInstalled` en `index.ts` — instanciar el provider recién instalado,
arrancarlo y montar su `configRouter` (y su `router` público si declara `providesRouter`), exactamente lo
que ya hace el bucle de arranque.

**A quién beneficia:** a todos los providers dueños de su configuración, que hoy arrastran un
`requiresRestart: true` que dejaría de ser necesario por este motivo: `http-pull-push`, `service-flow` y
cualquiera de terceros. Ojo: `requiresRestart` seguiría haciendo falta por **otras** razones (un provider
que registre informers o consuma recursos del arranque), así que el arreglo no lo elimina en bloque — hay
que revisarlo caso por caso.

**Relacionado:** el mismo hueco explica el aviso que ya se da al instalar estos providers, documentado en
la guía de administración (`08-extending-kwirth`, *When a restart is needed*). Si esto se arregla, esa
página hay que revisarla.

### Validado el 2026-09-12: SIGUE PENDIENTE

Revisado a petición del usuario, que lo creía arreglado. No lo está, y la prueba es de una línea:

```ts
// back/src/index.ts:1427
let providerApi = new ProviderApi(providerManager, registeredProviders, apiKeyApi, {}, () => ri.clusterInfo.providers)
```

Ese `{}` es el objeto de callbacks. `ProviderApi` sigue declarando `onProviderInstalled?` y sigue
disparándolo en `/install` y `/upload`, pero como nadie lo pasa queda `undefined` y no ocurre nada.
`mountProviderConfigRouter` se sigue llamando desde los dos sitios de siempre (`:1484` arranque,
`:1366` instalación de un plugin) y desde ningún otro.

⚠️ **Por qué parecía arreglado.** Se instaló sugarless 0.2.0 del marketplace y funcionó — pero eso no
lo desmiente: se instaló también el **plugin**, que declara `provider:sugarless:0.2.0` en
`requiresExtension`, y esa ruta sí instancia el provider y sí monta su router. Y encima se reinició el
core después. El síntoma solo aparece instalando un provider **solo** y sin reiniciar.

### Diseño del arreglo

**1. El callback, en `index.ts:1427`** — el `{}` pasa a llevar la implementación:

```ts
let providerApi = new ProviderApi(providerManager, registeredProviders, apiKeyApi, {
    onProviderInstalled: async (id: string) => { await bringProviderUp(riRouter, ri, id, apiKeyApi) }
}, () => ri.clusterInfo.providers)
```

**2. `bringProviderUp()`, nueva, junto a `mountProviderConfigRouter` (`index.ts:1227`).** No hay que
inventar nada: es lo que ya hace el bucle de arranque de `:1464-1485`, en cinco pasos.

| | |
|---|---|
| instanciar | `createProviderInstance(registeredProviders.get(id), ri.clusterInfo, ri.kwirthData, ri.providerStorage)` |
| configurar | `providerManager.getConfig(id)` y, si trae algo, `providerInstance.configure(cfg)` |
| arrancar | `startProvider()` y push a `ri.clusterInfo.providers` |
| router público | si `providesRouter`: `riRouter.use(alias ?? '/<ri.id>/provider/<id>', provider.router)` y `started = true` |
| configRouter | `mountProviderConfigRouter(riRouter, provider, apiKeyApi)` |

**3. Los dos sitios que ya lo hacen, a usarla.** Ese bloque está hoy **copiado dos veces** (arranque
`:1464` e instalación de plugin `:1341-1366`) y el arreglo lo dejaría en tres. Ahí está el valor real de
extraerlo: que el arranque y la instalación en caliente no puedan volver a divergir, que es exactamente
cómo nació este bug.

### Tres detalles que muerden

**El callback es síncrono y el trabajo no lo es.** `onProviderInstalled?: (id: string) => void`
(`ProviderApi.ts:10`), pero `providerManager.getConfig()` se espera. Hay que ampliarlo a
`(id: string) => void | Promise<void>` y **await**earlo en las dos rutas que lo disparan
(`ProviderApi.ts:139` y `:153`). Si no, un fallo al montar se traga y `/install` responde `200` con el
provider a medio levantar — peor que el bug actual, porque miente.

**El orden de montaje tiene que funcionar.** Express recorre el stack en orden de registro, así que
añadir rutas a `riRouter` *después* solo vale si no hay un catch-all detrás. Comprobado el 2026-09-12:
el bucle de providers es lo último de `setupRoutes` y el estático del front va a nivel de `app`, después
del dispatch. Funciona — pero es justo lo que haría que el arreglo pareciese no hacer nada.

**`onProviderUninstalled` tiene el mismo hueco y NO se arregla igual.** También está declarado y sin
implementar, pero desinstalar en caliente es otro problema: Express no sabe desmontar rutas, así que el
router se queda colgado y el polling sigue corriendo. Exige un guardián en el propio handler, o
reinicio. **No meterlo en el mismo cambio.**

### Después del arreglo

`requiresRestart: true` deja de ser necesario **por este motivo** en los providers dueños de su
configuración, pero no se puede quitar en bloque: los que registran informers o consumen recursos del
arranque lo siguen necesitando. Uno a uno. Y hay que repasar *When a restart is needed* de la guía de
administración, que hoy documenta este aviso.

**Estado: pendiente, sin empezar.** Decisión del usuario el 2026-09-12: se deja documentado y no se
toca por ahora.
