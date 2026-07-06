# Plan — business provider → instalable + convenio de endpoint `/provider/{alias}`

> Estado: **redacción** (sin empezar). Tarea OSS, **independiente de Agora**.
> Objetivo: sacar el provider `business` del core a `providers/business/` (instalable, patrón kafka)
> y migrar el convenio de montaje de routers aliased a `/provider/{alias}` (externo, sin `ri.id`).

## Contexto / situación actual

- **business vive en el core**: `back/src/providers/business/BusinessProvider.ts`, registrado a mano en
  `back/src/index.ts` (import línea 64 + `registeredProviders.set('business', …)` línea 164).
- `providesRouter=true`, `routerAlias='business'` → hoy se monta en **`/business`**
  (`back/src/index.ts:1390-1391` en arranque y `:1217` on-demand) y se auto-instancia aunque nadie lo requiera (`:1632`).
- **Consumidores (3)**: `censor`, `pinocchio`, `montag` — declaran `requirements.providers: [… 'business']`,
  llaman `addSubscriber('business', …)` y manejan `case 'business'`. Cada plugin castea el payload a su propio tipo
  (pinocchio define `IBusinessProviderEvent` local; censor/montag usan `{spaces}` inline). **No hay tipo compartido**.
- **pinocchio front** hace `POST ${clusterUrl}/business` (`PinocchioPlayground.tsx:277`).
- **Degradación ya graciosa**: `ClusterInfo.addSubscriber` (`back/src/model/ClusterInfo.ts:60`) solo **loguea error y sigue**
  si el provider no existe → los canales cargan igual, los eventos business no llegan y `/business` da 404. Nada bloquea el arranque.

### Convenio de endpoint (decisión: Opción B, convenio global)
- Aliased = **exposición externa → sin `ri.id`**. Se cambia el montaje `/${alias}` → `/provider/${alias}` en los **dos** sitios.
- Impacto real: **metrics** (`/metrics` → `/provider/metrics`) y **business** (`/business` → `/provider/business`).
- otel (`/otlp` → `/provider/otlp`) cambia también pero **sin consumidores** (no se usa aún); solo se actualiza el comentario doc.
- metrics **no** es un scrape Prometheus: es API interna de definiciones/uso consumida por el front → impacto contenido.

### Barrido de consumidores — VERIFICADO en todas las extensiones (providers, plugins, homepages, senders + privadas agora/defender/montag)

**Consumidores del endpoint HTTP** (los únicos que rompe la migración `/x` → `/provider/x`):
- `/metrics` → **solo front core** (4): `front/src/tools/Global.ts:13` (`GET /metrics`),
  `front/src/App.tsx:1730` (`POST /metrics/config`), `front/src/App.tsx:2095` (`GET /metrics/usage/cluster`),
  `front/src/components/Homepage.tsx:54` (`GET /metrics/usage/cluster`).
- `/business` → **solo** `plugins/pinocchio/src/front/PinocchioPlayground.tsx:277` (`POST /business`).
- `/otlp` → **0 llamadas en el repo** (solo comentario doc de otel; exporters OTLP externos).
- **Homepages (avicii, clusterized, depeche-mode, matrix)**: SÍ consumen métricas, pero **no llaman al endpoint directamente** —
  usan el callback `props.getClusterMetrics(name)`, definido de forma **centralizada** en `front/src/App.tsx:2091-2100`
  (que es quien hace `GET /metrics/usage/cluster`, línea 2095, **ya listado arriba**). → Los 4 ficheros de homepage **no cambian**,
  pero **dependen** del fix central de App.tsx:2095. Ningún sender llama a estos endpoints por HTTP. ✅
- **Fuera de alcance (plan events-provider, no este)**: las homepages también usan `props.getClusterEvents(name)` →
  `front/src/App.tsx:2082-2090` hace `GET /events` (ruta core, `EventsProvider` es `providesRouter=false`/`routerAlias=undefined`,
  **no** es endpoint aliased). Cuando se aborde el plan events-provider, el punto de migración de las homepages es App.tsx:2086.

**Suscriptores de business** (dependen de que esté instalado → degradación):
- censor (`back:209`), pinocchio (`back:84`), montag (`back:163` + `:1192`); los 3 con `requirements.providers: [… 'business']`.

**Notas del barrido:**
- Providers aliased = exactamente **metrics, business, otel** (`kafka/trivy/tick/sample/syslog/validating` → `routerAlias=undefined`, no se tocan).
- **montag** tiene `routerAlias='montag'` pero es alias de **channel** (montaje en `index.ts:1226/:1478`, **distinto** del de providers `:1390/:1217`) → **no afectado** por este cambio.
- montag front solo llama a `/senders` (API core, no provider) → no afectado.

---

## Fases (cada una un MVP usable)

### F1 — Crear `providers/business/` instalable (patrón kafka) — ✅ HECHA
- `src/index.ts`: copiar la clase, cambiando:
  - imports core relativos → `@kwirthmagnify/kwirth-common-back` (`KwirthData, IProvider, IProviderSubscriber`)
  - `IChannel` → `IProviderSubscriber`; `logInfo/logError` → `console.*`; quitar `ApiKeyApi`
    (`apiKeyApi = undefined`, `requiresApiKeyApi = false`)
  - `data: Map<string, Map<string, unknown[]>>` y `event: unknown` (regla no-`any`; el provider no inspecciona el payload)
  - mantener `providesRouter=true`, `router`, `routerAlias='business'`; `export default BusinessProvider`
- `package.json` (id `business`, name `@kwirthmagnify/kwirth-provider-business`, publisher, **version 0.1.0**,
  displayName, description; `express` external; dep común-back)
- `build.mjs` / `watch.mjs` (copiar de kafka; external `express`)
- `README.md` (regla del proyecto: descripción + config `{spaces}` + ejemplo de POST + formato del evento)
- **Sin cablear todavía**: el core sigue sirviendo business → nada cambia funcionalmente.
- **Check**: `npm run build` en `providers/business` genera `dist/back.js` + `dist/package.json`. `tsc --noEmit` verde.

### F2 — Business pasa a instalable (quitar del core + cablear dev + QA degradación) — 🟡 código hecho, QA pendiente (dev del usuario)
- [x] `back/src/index.ts`: borrado import y `registeredProviders.set('business', …)`.
- [x] Borrada carpeta `back/src/providers/business/` (quedan `events/`, `metrics/`, `IProvider.ts`).
- [x] `back/kwirth-dev.json`: añadido `providers.business = "../providers/business/dist"`.
- [x] `back` compila sin business (`tsc --noEmit` exit 0) → sin referencias colgando.
- **Manifest → movido al cascade** (el `providers/manifest.json` cataloga versiones **publicadas en npm** con `url` al tgz;
  añadirlo antes de publicar dejaría URL rota). Se añade al publicar 0.1.0.
- **bump de versión del back → cascade** (se hace una vez en release, no ahora).
- [x] **QA (con business, dev)**: verificado — ingesta `POST /provider/business` (200/400), fan-out a pinocchio (Playground) OK.
- [x] **QA (degradación, sin business)**: verificado — quitado de `kwirth-dev.json` + reinicio → back **arranca y estable**,
  `POST /provider/business` → 404, metrics/validating intactos, y log `Cannot subscribe … (provider do not exist)` con los plugins
  arrancando sin crashear. Restaurado el wiring después.

### F3 — Convenio de endpoint `/provider/{alias}` — ✅ HECHA + VALIDADA
- [x] `back/src/index.ts`: `:1390-1391` y `:1217`, `/${alias}` → `/provider/${alias}` (externo, sin `ri.id`).
- [x] Front metrics (4 llamadas): `Global.ts:13`, `App.tsx:1730`, `App.tsx:2095`, `Homepage.tsx:54` → prefijo `/provider/metrics…`.
- [x] pinocchio front: `PinocchioPlayground.tsx:277` `/business` → `/provider/business`.
- [x] otel: comentario doc → `/provider/otlp/v1/…`.
- [x] **validating aliased** (hallazgo del barrido de logs): era `routerAlias=undefined` → salía con `ri.id`, pero su `/validate`
  lo llama el API server (ValidatingWebhook) → externo. Cambiado a `routerAlias='validating'` + rebuild → `/provider/validating`.
- [x] **Check**: back+front `tsc` verde; logs `/provider/metrics`, `/provider/otlp`, `/provider/business`, `/provider/validating`;
  canal metrics + homepages + playground pinocchio validados en UI contra las rutas nuevas.

### F4 — Tests / harness (patrón defender) — ✅ HECHA
- [x] Refactor: extraído `ingest(body)` (router fino) → lógica testeable sin HTTP; eliminada rama muerta `type===''`.
- [x] **Unit** (`tests/fanout.test.ts`): filtrado por `space`/`type`, evento exacto entregado, `types` vacío = nada,
  varios subscribers, `removeSubscriber`, acumulación en el store, `stopProvider`.
- [x] **E2E** (`tests/http.test.ts`): express efímero + `POST` real → 200/400 y subscriber recibe el payload.
- [x] Runner `tests/run.mjs` (esbuild → `node --test`, sin deps nuevas). **11/11 verde**.
- **Corrección de doc**: la semántica real de `types` es "solo se entrega si el type está en la lista" (vacío = nada);
  README y comentarios corregidos (decían "vacío = todos", falso).

---

## Cascade / publicación — ✅ HECHA (extensiones)
- [x] `@kwirthmagnify/kwirth-provider-business@0.1.0` publicado + alta en `providers/manifest.json`.
- [x] `@kwirthmagnify/kwirth-provider-validating@0.1.5` (bump propio por el alias) publicado + `providers/manifest.json`.
- [x] `@kwirthmagnify/kwirth-plugin-pinocchio@0.2.24` (bump propio, front toca endpoint) publicado + `plugins/manifest.json`.
- **censor/montag NO se republican**: no tocan el endpoint HTTP (solo `addSubscriber('business')` in-process); su código no cambió.
- **Pendiente del USUARIO (versionado global)**: build+versión de **back** (business fuera + convenio endpoint) y **front**
  (rutas `/provider/metrics…`, playground) — se hace en el release global, no por extensión.
