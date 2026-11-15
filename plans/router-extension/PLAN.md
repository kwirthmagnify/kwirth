# Router — PLAN

> Cuelga de [PRD.md](PRD.md) (validado 2026‑11‑15). Aquí, el cómo y el orden. Estado: **S1–S6 hechos** (2026‑11‑15). S1–S5 con QA en k3d (router de eco del scaffolder) y e2e
`routers-manager.spec.ts` 7/7. **S6: `@jfvilas/kwirth-router-bridge@0.1.0` publicado**, QA k3d ↔ AKS completo.
Guía hecha (`guide/extensions/routers/index` y `/bridge`, con capturas de `capture-routers.spec.ts`).
**S7 hecho** (2026‑11‑15): el core registra los **pluters** (`RouterManager.adoptPluter` / `dropPluter`, enlazado
a los cuatro sitios donde se registra, sustituye o quita un canal: arranque, instalación en caliente, recarga en
dev y desinstalación); `common-back` 0.6.17 documenta que el ciclo de vida de un pluter es el del canal. El plan
del pluter de pago queda reorientado en su repo; se declara router cuando lleve tráfico.
**Tipo `router` cerrado.**

## Backlog

- **Indicador directo / ruteado en el selector de clusters** (pedido 2026‑11‑15). En la lista de clusters del
  *Resource selector* (y donde se elige cluster), cada entrada muestra si se llega **directamente** o **por un
  router**, y por cuál (`bridge`, `ianus`…); y si su router no está instalado o no ha arrancado, que se vea ahí
  y no solo al fallar la conexión. Solo front: el dato ya está en la entrada (`cluster.route`) y en
  `KwirthData.routers`.
  - **Y un cluster que no está accesible ahora sale en GRIS** (pedido 2026‑11‑15, QA de Ianus Fase 2): p. ej. el
    destino quitó su rol, el router no tiene enlace, o la conexión directa falla. Hoy aparece igual que los demás
    y el error solo se ve al elegirlo. Se hace al retocar la UX de esa select.
  - **El gris no se refresca** (visto 2026‑11‑15, QA de Ianus): si el destino no está listo el cluster sale gris,
    pero cuando el túnel se levanta el estado no se actualiza y sigue gris. El estado de accesibilidad tiene que
    revisarse solo (al abrir la select o periódicamente), no quedarse con la primera respuesta. Se mira al revisitar
    el *Resource selector*.

- **Marca del core para el tráfico que entra por un router** (visto al cerrar `bridge`). Un router entrega lo que
  lleva al core destino por **loopback**; para el filtro de IP del login eso parece local, y pasa donde loopback
  está permitido (Magnify desktop siempre, o loopback en la lista o en los proxies de confianza). Hoy el filtro
  solo actúa en `POST /login` y las rutas se usan con keys, así que el hueco es estrecho (documentado en el README
  de `bridge`). Arreglo genérico: `IRouterContext` da a cada router una marca que solo conoce el core, que la pone
  en lo que entrega, y el core trata ese tráfico como **externo** (ni loopback ni `X-Forwarded-For`).

Decisiones tomadas al hacerlos (2026‑11‑15):
- El contrato lleva `routerRequest?(req, res, caller)` en vez de un `Router` de express: así el core le pasa quién
  llama en cada petición. `IRouterContext`, `ERouteCallerVia`, `IRouterStatus` y `TRouterConfig` validados.
- **Tickets opacos en memoria** (no HMAC): una credencial en una url no debe *ser* la credencial, y una sesión la
  sirve una réplica. 10 min; el front los renueva. Borrar una key borra sus tickets.
- El ticket va **en el primer segmento** debajo de `/router/<id>/` (plantilla `'/{routeTicket}/…'`) y el core lo
  quita antes de entregar. Orden: ticket → `loopback` (solo desde loopback) → access key en `Authorization`. Una
  key que no es de este core no es un error: es la del destino, y pasa intacta.
- Los WebSockets que un router toma con una access key se cortan al borrar la key (como K1).
- El despachador va **antes del body parser** y con CORS.

## Orden y dependencias

```
S1 contratos ──► S2 gestor (back) ──► S3 despachador + tickets (back) ──► S4 front ──► S6 bridge ──► S7 pluter
                         └──────────────► S5 scaffolder
```

Cada stream termina con sus tests (unitarios y e2e) en verde y su QA; el que no tiene UI se prueba y se cierra con
el primero que la trae.

## S1 · Contratos (common, common-back)

- `EExtensionType.ROUTER = 'router'`.
- `IRouterData { id, pathTemplate, needsTicket }` en common, **en lugar de** `IClusterRouteResolver`.
  `resolveClusterRouteUrl` construye `<base>/router/<id><path>`.
- `IRouteCaller { accessKey, user? }` (quién llama, ya autenticado por el core).
- `IRouter` en common-back: `getRouterData`, `router?`, `routerWebsocket?(ws, req, caller)`, `startRouter(config)`,
  `applyConfig(config)`, `stopRouter()`, `getConfigSchema()`, `getScopeCatalog?()`, `setLogger(logger)`,
  `getStatus?()` (§10 del PRD: método opcional).
- `ERouteOwnerKind.ROUTER`.
- **Se quitan** `BackChannelData.clusterRouteResolver` e `IChannel.pathWebsocketRequest`.
- Publicar common y common-back (versión nueva cada una).

**Tests:** `clusterRoute.test.ts` reescrito sobre `IRouterData`.

## S2 · Gestor de routers (back)

- `RouterManager`: instalar / actualizar / desinstalar (ConfigMaps `kwirth-router-<id>-meta|-back`), cargar al
  arrancar, `installBundled`, routers de desarrollo desde `kwirth-dev.json` `"routers"` (con hot reload).
- Config en **Secret** `kwirth-router-<id>-config`; `GET` real, `PUT` guarda y llama a `applyConfig` en caliente.
- `RouterApi` en `/core/routers`: `installed`, `install`, `upload`, `remove`, `:id/schema`, `:id/config`,
  `:id/status`.
- Altas en las listas por tipo: `MarketplaceManager` (`routers`), `PackApi`, `ExtensionDeps`, `ExtensionRefs`,
  `setInstalledExtensionsSource`, `buildExtensionAccess`, `kwirth-dev.json`.
- Scopes de los routers en el catálogo del core (editor de seguridad).
- Logger con componente `ROUTER`.

**Tests:** unitarios del manager (instalar, config en Secret, hot reload, desinstalar); e2e de la API.

## S3 · Despachador y tickets (back)

- Un solo montaje `<rootPath>/router/:id` (HTTP) y la derivación de los upgrades WS de esa ruta: busca el router
  **vivo** por id en cada petición → instalar/quitar sin reiniciar.
- Autenticación antes de entregar, y el router recibe `IRouteCaller`:
  - **ticket de ruta** en la ruta (navegador);
  - **access key** en `Authorization` (back a back: el enlace de `bridge`);
  - **`loopback`**, solo desde loopback.
- `POST /core/routes/ticket`: emite un ticket firmado (HMAC, clave en Secret del core), caducidad corta; el front lo
  renueva.
- `openRemoteChannel` resuelve rutas contra los routers.
- Se quita el routing de canales: `ClusterRouting.ts` y `WsPathDelegation.ts` pasan a routers; los dos comentarios
  que nombran una extensión concreta, genéricos.

**Tests:** despachador (router vivo/ausente/desinstalado), tickets (firma, caducidad, manipulación, reutilización
entre usuarios), loopback solo desde loopback; e2e con un router de prueba.

## S4 · Front

- `RouterDescriptor` y gestor **Routers** en el menú (`MenuDrawer`, `App.tsx`), diálogo de config genérico
  (`ConfigFormDialog`) con los secretos enmascarados y el ojo.
- `ClusterRouting`/`RouteTickets`: la lista de routers sale de `kwirthData.routers`; el ticket, de
  `POST /core/routes/ticket`.
- *Manage clusters*: el selector de ruta lista routers.

**Tests:** e2e del gestor y de *Manage clusters* (`manage-clusters-route.spec.ts` adaptado).

## S5 · Scaffolder

- `tools/create-kwirth-router.mjs`: esquema de config, un scope, un `router` HTTP de eco, README con el contrato;
  fila en `tools/README.md`.

**Tests:** el router generado compila, se instala y responde (e2e).

## S6 · `bridge` (jfvilas/kwirth)

Su PLAN vivirá en `routers/bridge/docs/plan/PLAN.md`. Resumen: scaffold con S5 → enlace y elección del uid menor →
túnel multiplexado → consola → tests → QA con dos Kwirths (dev + uno en la nube) → publicar en `@jfvilas`.

## S7 · Migrar el pluter de pago

Se hace en su repo y su sesión, cuando `bridge` funcione.

## Documentación

Sección *Routers* en la guía del core (concepto, gestor, rutas en *Manage clusters*, seguridad: un router lleva
tráfico autenticado como el usuario).
