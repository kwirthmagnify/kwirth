# Router — PLAN

> Cuelga de [PRD.md](PRD.md) (validado 2026‑11‑15). Aquí, el cómo y el orden. Estado: **S1–S6 hechos** (2026‑11‑15). S1–S5 con QA en k3d (router de eco del scaffolder) y e2e
`routers-manager.spec.ts` 7/7. **S6: `@jfvilas/kwirth-router-bridge@0.1.0` publicado**, QA k3d ↔ AKS completo.
Guía hecha (`guide/extensions/routers/index` y `/bridge`, con capturas de `capture-routers.spec.ts`).
**S7 hecho** (2026‑11‑15): el core registra los **pluters** (`RouterManager.adoptPluter` / `dropPluter`, enlazado
a los cuatro sitios donde se registra, sustituye o quita un canal: arranque, instalación en caliente, recarga en
dev y desinstalación); `common-back` 0.6.17 documenta que el ciclo de vida de un pluter es el del canal. El plan
del pluter de pago queda reorientado en su repo; se declara router cuando lleve tráfico.
**Tipo `router` cerrado.**
**S8 abierto** (2026‑11‑17, sin empezar): el estado de los clusters en el Resource selector (gris que no se
refresca, directo / ruteado), el e2e del switch *Enabled* y el unitario intermitente de `webhookReceiver`.

## Backlog

- ✅ **Hecho 2026‑11‑16 — bridge: bucle de enlace duplicado** (`router/bridge@0.1.1`). No era que los dos lados se
  marcaran: el back de dev de k3d se reiniciaba, su enlace moría sin cierre y AKS, que no hace ping a los
  entrantes, lo daba por vivo. Al volver k3d, los dos enlaces los había abierto k3d, la regla del uid más bajo no
  podía elegir y AKS se quedaba con el muerto, rechazando el nuevo con `4409` cada pocos segundos. Ahora el
  enlace nuevo del mismo lado sustituye al viejo. Queda en su backlog que el receptor haga ping a sus entrantes.

- ✅ **Hecho 2026‑11‑16 — el ticket de ruta caducaba dentro de las URLs de los tabs**. `channelObject.clusterUrl`
  se calculaba una vez, al crear el tab, con el ticket de ese momento (10 min de vida): lo que un tab abría DESPUÉS
  (una segunda shell de ops, una ventana de Magnify, el `fetch` de un diálogo, la reconexión del socket) salía
  rechazado con 4401. Ahora es un getter (`bindClusterUrl`, front) que lee el ticket vigente; los bucles de
  reconexión la leen en cada intento. El ticket sigue durando 10 min (alargarlo dejaba útil una URL leída en
  los logs del ingress mientras durase la sesión). Revisadas las copias en todos los plugins: Magnify (ventanas
  externas) e Iter (clave de caché) dejaron de copiarla. Documentado en `developing/front.md`.

- ✅ **Hecho 2026‑11‑16 — el keepalive del canal remoto cortaba enlaces sanos bajo carga**. Si el pong no volvía
  antes del siguiente tick (30 s), daba el socket por muerto; con Magnify pasando ~100 MB por un enlace de Ianus
  el pong esperaba detrás de los datos y el enlace (y todas sus sesiones) caía cada pocos minutos. Ahora
  cualquier mensaje recibido cuenta como señal de vida (`RemoteChannel`), con test.

- **Indicador directo / ruteado en el selector de clusters** (pedido 2026‑11‑15) → **en el stream S8**. En la lista de clusters del
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

## S8 · Selector de clusters al día, y dos tests pendientes

Abierto el 2026‑11‑17, a petición del usuario. **Sin empezar.** Tres tareas:

- ✅ **Hecho 2026‑11‑17, QA del usuario OK.** Al abrir la lista de clusters se vuelve a comprobar cada entrada
  menos el home (`recheckCluster` en `front/src/tools/Global.ts`): la gris se relee entera, la que contestaba
  solo pide `/config/info` y pasa a gris si no contesta en 5 s; sin avisos. Cada entrada dice `direct`,
  `via <router>`, `· router not installed or not started` o `· not answering` (aria-hidden: el nombre accesible
  de la opción sigue siendo el del cluster); el campo cerrado no lo enseña. `readClusterInfo` decide `enabled`
  al final, así que releer no hace parpadear. Sin comprobación periódica (bastó con la de abrir).
  **S8.1 · El estado de los clusters en el Resource selector.** El cluster **en gris no se refresca solo**: si el
  destino no estaba listo sale gris, y cuando el túnel se levanta sigue gris. El estado de accesibilidad se vuelve
  a comprobar **al abrir la lista** o **cada cierto tiempo**, en vez de quedarse con la primera respuesta. Es parte
  del punto del backlog *Indicador directo / ruteado en el selector de clusters*, que entra entero aquí:
  - cada entrada dice si se llega **directa** o **por un router**, y por cuál (`bridge`, `ianus`…), y si ese router
    no está instalado o no ha arrancado. Solo front: el dato está en `cluster.route` y `KwirthData.routers`;
  - un cluster que **no responde** sale en **gris** (destino sin su rol, router sin enlace, conexión directa caída).
- ✅ **Hecho 2026‑11‑17**: `front/e2e/tests/manage-clusters-enabled.spec.ts`, 4/4 dos veces seguidas. Trabaja
  sobre una entrada SUYA (`e2e-enabled`, url `.invalid`) que borra al acabar: apagada sigue en la lista
  atenuada y no sale en el selector; encendida vuelve, en gris y con `direct · not answering` (cubre S8.1); el
  switch del home no se toca. ⚠️ Visto al lanzarlo junto a `manage-clusters-route.spec.ts`: ese da por hecho
  que **no hay routers** (Route deshabilitado) y en el dev hoy están Ianus y bridge desde `dist`, así que su
  primer caso falla. ✅ Arreglado el mismo día: ese caso hace `test.skip()` si `GET /core/routers` trae alguno
  (se pregunta al back, no al campo que se prueba); los dos specs, 6 ✅ · 1 ⏭.
  **S8.2 · e2e del switch *Enabled* de Manage cluster list** (`Cluster.inUse`). Desmarcarlo saca el cluster del
  selector y de lo que lee el back (`readUserStore('clusters','list')`, `back/src/tools/ClusterListFilter.ts`);
  marcarlo lo devuelve. No destructivo: el test deja el switch como lo encontró.
- ✅ **Hecho 2026‑11‑17.** No era el test: `WebhookManager.install` nombraba el tgz y el directorio de extracción
  solo con `Date.now()`, y `node --test` corre los ficheros en paralelo; dos instalaciones en el mismo
  milisegundo compartían ficheros y la primera en acabar borraba el directorio de la otra (`Invalid webhook
  bundle`). Arreglo: `uniqueTempPath()` en `PackageRegistries.ts` (tiempo + UUID). Test nuevo en
  `webhookManager.test.ts` con `Date.now()` congelado (falla sin el arreglo); suite 1031 ✅ tres veces seguidas.
  ⚠️ **El mismo patrón está en ~55 sitios más** (Plugin, Provider, Sender, Theme, Homepage, Login, Idp, Dce,
  Router, AiToolset, Docs, Pack, BundledExtensions): mismo fallo en producción con dos instalaciones a la vez.
  **S8.3 · `webhookReceiver`, el unitario que falla de forma intermitente**
  (`back/tests/tools/webhookReceiver.test.ts`). Buscar el origen (tiempos, puertos o estado compartido), no
  subir timeouts.

## Documentación

Sección *Routers* en la guía del core (concepto, gestor, rutas en *Manage clusters*, seguridad: un router lleva
tráfico autenticado como el usuario).
