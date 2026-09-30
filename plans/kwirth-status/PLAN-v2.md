# Kwirth Status v2 — Plan

> **ESTADO — VIVO** (2026-09-30): S1, S2, S2b, S2c (DCE), S3 y S4 (Plugins) hechos; publicado `plugin/status@0.5.0`. Queda S5 (el resto de extensiones) y el backlog (B1, B3, B4, B5; B7 forzado por contrato). Cuelga de [PRD-v2.md](PRD-v2.md), que manda en el **qué** y el **por qué**.
> Segunda versión tras [PLAN.md](PLAN.md) (cerrado en `plugin/status@0.2.7`).
>
> Documento **append-only**: lo que se decide no se borra, se marca. Si algo de aquí contradice lo que ves
> en el producto, gana el producto.

## Lo que ya existe y no hay que construir

- Todo **status**: inventario, tabla con *Why*, grafo en capas (`StatusGraph.ts`, probado contra elk real),
  contadores de entregas, auto-refresco, líneas que frenan, nodos estables. Se reorganiza, no se reescribe.
- **recharts** en los globales del core (`window.__kwirth__.recharts`): las minigráficas de RF3 no suman
  bytes al bundle, igual que React Flow y elk.
- `clusterInfo.senders` y `clusterInfo.webhooks`: el patrón de acceso de solo lectura que RF6 extiende.

## Streams

Cada stream cierra con su CL9 completa.

### S1 — Las pestañas · ✅ HECHO (2026-09-28)

Cerrado sin versión: la v2 se publica entera al final, no con pestañas que prometen. `EStatusTab` con valor
explícito por pestaña; Providers solo con providers y pluviders; Extensions con senders y webhooks, sin las
columnas de productor; Performance y Plugins explican por qué aún no tienen datos. +5 e2e (29 en total) y el
del filtro reescrito, que con solo providers en la tabla ya no probaba nada. Capturas de la guía
regeneradas: el grafo del dev ya enseña tres capas reales (`aws` y `azure` consumen `cloud-config`).

Lo planeado era:

- Pestañas con **enum** (regla de la casa): Providers y Graph con el contenido actual; Performance,
  Plugins y Extensions como pestañas que dicen que llegan en S2–S4. Refresco y hora de la foto, comunes.
- La pestaña 1 pasa a **solo providers y pluviders**; senders y webhooks siguen en el inventario (los usará
  la 5) pero salen de la tabla.
- Tests (harness + e2e) al día con las pestañas; guía `docs/0.6.31/channels/status.md` y sus capturas.
- **README dentro del paquete npm** (regla nueva del CL9): el `build.mjs` lo copia a `dist/`.

### S2 — Performance (RF3) · ✅ HECHO (2026-09-29, publicado en `plugin/status@0.3.0`)

Cinco cifras del proceso (RSS, heap, CPU, event loop, uptime) en cajas iguales de ancho completo, con icono
y color, y tres minigráficas de la sesión con recharts del core, del mismo color que su caja. El muestreador
del event loop solo corre con alguna pestaña abierta, y `cleanup()` lo apaga en las recargas de dev.

### S2b — Home, Routes, Log y Previous log · ✅ HECHO (2026-09-29, `plugin/status@0.3.0`)

Añadido sobre la marcha, a petición del usuario:

- **Home**: una tarjeta por pestaña, tres por fila, misma altura y ocupando todo el espacio; cada una abre
  su pestaña. Una **DCE** reservada (ver B2).
- **Routes**: todas las rutas HTTP publicadas, una línea por ruta y dueño con sus métodos, y las
  **colisiones** marcadas. Exige tocar el core: el `RouteRegistry` que existía (Fase 1a del validador de
  rutas, sin cablear) se amplía con `record`/`forget`/`listRoutes` y se cablea en **modo solo anotar** en
  los ~37 puntos donde el core publica una ruta; se expone como `clusterInfo.routes`. Ver B1.
- **Log** y **Previous log**: el log del core y el del contenedor anterior, que vivían en About. About los
  pierde y deja de pintar el ASCII art carácter a carácter; el aviso de reinicio remite a Status.
- La barra superior copia el patrón de Excubitor (26 px; el filtro siempre visible, deshabilitado donde no
  aplica).

⚠️ Lo que costó: `ConfigApi` declara rutas con un array y `listRoutes()` reventaba entero — Status lo tomaba
por "este core no lista rutas". Ahora entiende texto, array y RegExp, y cada montaje se lee aparte.

### S2c — La pestaña DCE · ✅ HECHO (2026-09-30, `plugin/status@0.4.0`)

Cierra B2, a petición del usuario en cuanto el tipo `dce` estuvo disponible:

- **Core**: `DceManager.consumers(id)` público (responde por el resolutor que ya existía) y el manager
  prestado en `clusterInfo.dces` (`IDceAccess`: `listInstalled`, `status`, `consumers`), igual que las rutas.
- **Pestaña DCE**: versión, origen, estado del **back** (viaja en la foto) y del **front** (leído del
  registro de la página, porque es este navegador el que lo cargó) por separado, el error escrito, y quién
  la consume. La instancia viva **no viaja**: solo estado y error.
- **Home**: la tarjeta DCE pasa a ser una puerta — DCEs, consumidores, sin uso y un chip de rotas.
- Con diez pestañas la barra deja de caber en 1400 px: pasa a `variant='scrollable'` (lo destapó la captura
  de la guía, después del QA; revalidado aparte).

⚠️ Lo que costó: **el e2e cazó un fallo del core**. Las extensiones de `kwirth-dev.json` construían su
metadato a mano y dejaban fuera `requiresExtension`: en dev nadie consumía ninguna DCE, y una DCE en uso se
podía desinstalar. Arreglado en plugin, provider, sender, webhook, theme y homepage (el IdP es B4).

Lo planeado para S2 era:

- Back: foto del proceso en cada refresco (`process.memoryUsage()`, `cpuUsage()` con su delta, retraso del
  event loop con `perf_hooks.monitorEventLoopDelay` solo mientras hay alguien mirando, uptime, versiones).
- Front: serie en memoria de la sesión y minigráficas con recharts. CPU % solo con dos fotos.

> **Re-partido el 2026-09-30** a petición del usuario: *"arranquemos con plugins de momento, que es la parte
> más delicada, y crea un stream nuevo para el resto de extensiones"*. S3 y S4 quedan **solo para plugins**;
> los otros siete tipos pasan a S5.

### S3 — El core expone los plugins (RF6, parte plugins) · ✅ HECHO (2026-09-30)

- `ClusterInfo.plugins` (`IPluginAccess`) con, por plugin, metadatos, estado —**RUNNING**, **REMOTE**,
  **NOT_STARTED**, **FAILED**, deducido de lo que el core ya sabía— y las cifras de su canal.
- Las cifras las da **el propio canal** con `getInstances()`, elegido por el usuario frente a recontar
  websockets en el core. Nació opcional y, por decisión del usuario, pasó a **obligatorio** en
  `kwirth-common-back@0.6.0` (ver B7). Un plugin que no lo trae sale como "no lo dice", nunca como cero; uno
  que lanza o contesta algo que no son dos contadores deja sin cifras solo a sí mismo.
- Los tipos, en **`kwirth-common`** (`Plugin.ts`), no en el core: decisión del usuario al diseñarlo, que
  además arrastró el B6.
- ⚠️ Lo que costó: el acceso se condicionó a que `pluginManager` existiera, y en el primer arranque se crea
  justo después — Status decía que el core no listaba plugins. Lo cazó el QA, no el harness (que prueba la
  función, no el cableado). Ahora se asigna siempre y se lee al preguntar.

### S4 — La pestaña Plugins (RF4) · ✅ HECHO (2026-09-30, `plugin/status@0.5.0`)

- La pestaña Plugins (se va el `PendingTab`, que se quedó sin uso) y la tarjeta de la Home con sus cifras:
  instancias abiertas de quien informa, y *not reporting* aparte.
- Con un core sin S3, lo dice en vez de enseñar una tabla vacía.
- De paso, a petición del usuario: las cinco figuras de Performance más altas (+30 % y luego +25 %, 128 px).
- ⚠️ El spec de capturas heredaba `trace: 'retain-on-failure'` y el cierre del contexto se colgaba volcando
  la traza: tardaba 2,6–3,1 min y a veces fallaba por timeout con todo hecho. Con la traza apagada, 1,2 min.
  La captura de Plugins tapa la URL de un registro privado (el usuario lo pidió; los nombres de producto sí
  pueden salir).

### S5 — El resto de extensiones (RF5, RF6) · PENDIENTE

- Core: accesos de solo lectura en `clusterInfo` para themes, homepages, logins, idps, aitoolsets, docs y
  packs, siguiendo el de senders/webhooks. Sin secretos ni URLs con token en lo expuesto.
- Pestaña 5: senders y webhooks + esos siete tipos. Con un core sin ellos, cada tipo que falte se dice como
  no disponible.

## Backlog

| # | Pendiente | Por qué no está hecho |
|---|---|---|
| B1 | **Revisar el RECHAZO de colisiones de rutas** (el resto de la Fase 1b del validador) | El usuario eligió *"solo anotar, y en backlog queda revisar el rechazo"*. Hoy el core anota y monta todo; dos dueños en la misma ruta se ven como colisión en Routes, pero ninguno se rechaza. El diseño cerrado del validador (`reserveAndMount` / `tryMountExtension`, rechazo con log) cambiaría el comportamiento: una extensión con un alias repetido dejaría de montarse |
| B2 | ✅ **La tarjeta DCE de la Home está reservada** — CERRADO 2026-09-30 en S2c (`0.4.0`) | Pedida sin contenido: *"añade una en la que añadiremos los DCE"*. Ya es una puerta a la pestaña DCE |
| B3 | **Al desinstalar un provider, sus rutas siguen listándose** | Se hace `forget()` al desinstalar un plugin, no un provider. Express tampoco desmonta: la ruta sigue respondiendo hasta reiniciar, así que listarla no miente — pero conviene decir que es de algo ya desinstalado |
| B4 | **Los conectores IdP de dev no salen en `listInstalledMeta()`** (core) | Encontrado en S2c. `IdpManager.listInstalledMeta()` lee solo el índice: un conector de `kwirth-dev.json` no aparece, así que el resolutor de consumidores de DCE no lo ve aunque declare `requiresExtension`. Es mayor que el hueco de los otros seis managers (a esos les faltaba solo el campo): cambiar el listado afecta también a quien lo pinta |
| B5 | **Aristas consumidor → DCE en el grafo** | La pestaña DCE dice quién consume a quién; el grafo aún no lo dibuja. Una capa más, por debajo de los providers |
| B6 | ✅ **Llevar a `kwirth-common` los contratos que hoy viven en el core** — HECHO 2026-09-30 dentro de S3 (`kwirth-common@0.5.62`): `ERouteOwnerKind`, `IPublishedRoute` e `IRouteAccess` en `PublishedRoute.ts`; `IDceMeta` e `IDceAccess` en `Dce.ts` (y `DceManager implements IDceAccess`). Status pierde `EStatusRouteOwner`, `IStatusRoute` y las vistas `IRouteAccessView`/`IDceAccessView`/`IDceMetaView` | Decidido al diseñar S3: lo que el core presta a los canales va en common (como `IPluginAccess` o `EDceState`), y así el back, el front y Status comparten el mismo tipo en vez de un espejo que hay que mantener igual a mano. Quedan fuera por ahora: `ERouteOwnerKind` (core, con su espejo `EStatusRouteOwner` en Status) e `IDceAccess` (solo en el core, con la vista privada `IDceAccessView` en Status) |
| B7 | **Que el resto de plugins implemente `getInstances()`** — **FORZADO** desde 2026-09-30 | Lo implementan Status, `magnify` y `metrics` (core) y el consumidor de ejemplo. Por decisión del usuario, *"a medida que los plugins vayan teniendo actualizaciones, se fuerce a que implementen ese interfaz"*: es **obligatorio en `IChannel` desde `kwirth-common-back@0.6.0`**, y la CL9 (punto 8) y la regla del bbpm exigen, al actualizar un plugin, subir common-back a la última **y** declarar `implements IChannel` —el `tsc --noEmit` de su `build.mjs` hace el resto—. El scaffold (`tools/create-kwirth-plugin.mjs`) ya genera la clase con `implements IChannel` y el método; comprobado en los dos sentidos: compila con él y falla con `TS2420` sin él. ✅ **Fuente al día 2026-09-30: los 23 plugins declaran `implements IChannel` y tienen el método** (auditado sobre `plugins/*/src/back/index.ts`, mirando solo la clase del canal —el `IChannel` del front es otro y ya hizo fallar dos auditorías—). Lo que queda no es código sino **rodaje**: cada plugin no reporta de verdad hasta que se **republica**, y eso pasa cuando le toque su bump. El primero en cerrar el ciclo entero (common-back `^0.6.0` + `implements` + método + publicado) es **`excubitor@0.2.9`**. Hasta que le llegue el turno a cada uno, la pestaña los enseña como "no lo dice", nunca como cero; el core no rechaza instalarlos, porque rompería todos los publicados. ⚠️ Ojo a una diferencia real entre implementaciones: los del core cuentan **todas** las conexiones (`webSockets.length`), Excubitor solo las que llevan alguna instancia |

## Registro de decisiones

| fecha | decisión |
|---|---|
| 2026-09-28 | Nace el PRD v2: cinco pestañas. Se planteó renombrar el canal a `kwirth` y se **descartó** el mismo día —*"un channel que se llame kwirth es un follón de nombres"*—: se queda `status`. |
| 2026-09-28 | Se toca el core para exponer plugins y extensiones en solo lectura (RF6). |
| 2026-09-28 | Pestaña 1 solo providers y pluviders; senders y webhooks, a la 5. |
| 2026-09-28 | Performance con serie de sesión en el front; nada persistente, nada en segundo plano. |
| 2026-09-28 | S1 entregado. La v2 no se publica por streams: se hace bbpm al cerrar S4, para no sacar pestañas vacías. |
| 2026-09-29 | **Se publica antes de S4**, por decisión del usuario, con Home, Performance, Routes y los dos logs: `plugin/status@0.3.0`. Plugins sigue diciendo por qué no tiene datos. |
| 2026-09-29 | Pestaña **Routes** con cada ruta y su método. El `RouteRegistry` se cablea en **modo solo anotar**: registra y monta como siempre; el rechazo queda en B1. |
| 2026-09-29 | El log del core y el del contenedor anterior **salen de About** y pasan a Status, en dos pestañas. |
| 2026-09-30 | Pestaña **DCE**. Los datos vienen del `DceManager` prestado en `clusterInfo.dces` (dos líneas en el core), no de que el front pida los ocho listados y recalcule los consumidores: eso duplicaría `findConsumers`. El estado del front se lee de la página. |
| 2026-09-30 | S3/S4 **solo para plugins**; el resto de extensiones pasa a un S5 nuevo (*"arranquemos con plugins, que es la parte más delicada"*). |
| 2026-09-30 | Las cifras de un plugin las da **su canal** (`getInstances()`), no el core recontando websockets. |
| 2026-09-30 | Los contratos que el core presta van en **`kwirth-common`**, compartidos por back, front y Status, en vez de un espejo por lado. Se aplica también a rutas y DCE (B6). |
| 2026-09-30 | `getInstances()` **obligatorio** desde `kwirth-common-back@0.6.0`, y la CL9 exige, al actualizar un plugin, subir common-back y declarar `implements IChannel`: *"a medida que los plugins vayan teniendo actualizaciones, se fuerce a que implementen ese interfaz"*. El core no rechaza instalar los viejos. |
