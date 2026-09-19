# Pluvider — PLAN

> Producto: [PRD.md](./PRD.md) (cerrado y validado 2026-09-18). Decisiones y hechos verificados:
> [DECISIONS.md](./DECISIONS.md) (D1–D16, F1–F12).
>
> Documento **vivo y append-only**: los streams no se borran, se marcan. Cada fase entrega
> funcionalidad usable por sí sola.

## Decisión de implementación (D18 — cerrada)

El core resuelve el id `plugin:<nombre>` con **registro aparte y resolución por prefijo**:
`clusterInfo.providers` sigue conteniendo **solo providers**, y `ClusterInfo.addSubscriber` mira el
id — si empieza por `plugin:`, resuelve contra el registro de pluviders y llama al `addSubscriber`
del canal; si no, camino actual intacto.

El motivo **no es la colisión de ids** —con el prefijo son únicos, y ahí no hay problema— sino que
**compartir el array es compartir los bucles** (F13). Metido en `clusterInfo.providers`, un canal
pasaría por la maquinaria de providers:

- [index.ts:1486-1497](../../back/src/index.ts#L1486-L1497) montaría su `router` en
  `/<ri>/provider/<id>` si declara `providesRouter` → **el router de su front publicado en una ruta
  que no exige accessKey**;
- [index.ts:1275-1277](../../back/src/index.ts#L1275-L1277) le escribiría `apiKeyApi`;
- [index.ts:1965](../../back/src/index.ts#L1965) lo listaría como provider habilitado;
- y `configure()`, `configRouter` y el flag `started` se le escribirían encima.

Un pluvider no debe pasar por ahí. Descartadas: array compartido con guarda en cada bucle (basta un
bucle futuro sin guarda para reabrir el agujero) y adelantar `publications[]` al MVP (es justo lo que
D7 sacó de él).

---

## F1 — El core sabe qué es un pluvider

**MVP de la fase**: un canal de prueba expone eventos y otro canal los recibe in-process, sin que
ninguno publique nada por HTTP.

### S1.1 — Contrato en `common-back` — *código escrito, checks técnicos verdes*

> **Entregado (2026-09-18)**: `PLUVIDER_ID_PREFIX` en [common/src/Channel.ts](../../common/src/Channel.ts),
> `IPluvider<TSub>` + `IPluviderData` en [common-back/src/IPluvider.ts](../../common-back/src/IPluvider.ts),
> exportado desde el index. `tsc --noEmit` **limpio** en `common` y en `common-back`. Sin colisión de
> miembros entre `IChannel` y `IPluvider` (conjuntos disjuntos, verificado nombre a nombre).
> **Pendiente**: publicar `@kwirthmagnify/kwirth-common-back` para que un plugin pueda compilar contra
> el contrato, y la checklist de cierre.

- Declaración explícita del plugin como pluvider (nada de duck-typing sobre `addSubscriber`), con el
  subconjunto push de `IProvider` que debe implementar: `addSubscriber`, `removeSubscriber`,
  `startProvider`, `stopProvider`, `getSubscriptionHelp` (obligatorio por RF6).
- **Tipos nuevos a validar contigo antes de escribirlos** (regla del proyecto). Van a
  `common-back/src/` junto a `IProvider.ts`, y el enum que salga, a `common`.
- El `id` **no lo escribe el autor**: lo compone el core como `plugin:<channelId>`, para que nadie se
  equivoque con el prefijo (RF3).

**Checks**: `tsc --noEmit` limpio en `common-back`; el contrato compila desde un plugin de ejemplo.

### S1.2 — Registro y resolución — *código escrito, checks técnicos verdes*

> **Entregado (2026-09-18)**: [back/src/providers/Pluvider.ts](../../back/src/providers/Pluvider.ts)
> (`TPluviderChannel`, `isPluvider`, `pluviderId`, `isPluviderId`); registro `pluviders` en
> [ClusterInfo](../../back/src/model/ClusterInfo.ts) con `addSubscriber`/`removeSubscriber`
> discriminando por prefijo; alta del registro en [index.ts](../../back/src/index.ts) al instanciar
> canales y en la instalación en caliente, y baja al desinstalar.
> `tsc --noEmit` limpio y **suite del back 275/275** (10 tests nuevos en
> [back/tests/model/pluviderResolution.test.ts](../../back/tests/model/pluviderResolution.test.ts),
> antes 265).
> **Nota**: `updateSubscriber` de `ClusterInfo` sigue vacío (`//+++ review how to implement`) también
> para providers. Implementarlo es un frente propio que afecta a los dos mundos, así que no se toca
> aquí — queda en el backlog.
> **Publicado para desbloquear**: `@kwirthmagnify/kwirth-common@0.5.50` y
> `@kwirthmagnify/kwirth-common-back@0.5.46` (el back consume los paquetes del registro, no del
> workspace: sin publicar, `IPluvider` no existía para el core).

- Registro de pluviders poblado tras instanciar los canales.
- `ClusterInfo.addSubscriber` resuelve `plugin:<x>` contra ese registro
  ([ClusterInfo.ts:61-69](../../back/src/model/ClusterInfo.ts#L61-L69)); el camino de providers queda
  **igual que hoy**.
- `removeSubscriber` / `updateSubscriber` por el mismo camino.

**Checks**: tests de back para los cuatro casos — pluvider existe / no existe / provider existe /
provider no existe. Verificar que el camino de providers no cambia de comportamiento.

### S1.3 — Orden de arranque (RF7) — *código escrito, checks técnicos verdes*

> **Entregado (2026-09-18)**: `startPluviders()` en
> [back/src/providers/Pluvider.ts](../../back/src/providers/Pluvider.ts), llamada desde
> [index.ts](../../back/src/index.ts) justo después de la fase de providers y antes de que
> `startRunningInstance()` arranque los canales. Mismo orden en la instalación en caliente
> (`startProvider()` antes de `startChannel()`), y `stopProvider()` simétrico al desinstalar.
> La fase se extrajo a función **para poder testearla**: estaba enterrada en una función de `index.ts`
> que no es testeable unitariamente.
> `tsc --noEmit` limpio y **suite del back 280/280** (5 tests nuevos en
> [back/tests/providers/pluviderStart.test.ts](../../back/tests/providers/pluviderStart.test.ts),
> antes 275).
> **Limitación honesta de la cobertura**: los tests verifican que la fase arranca a todos, que uno que
> revienta no tumba a los demás ni propaga, y que **espera** a cada `startProvider()`. Lo que NO
> cubren es el orden *respecto a los canales*, que es estructural: se valida en el arranque real, en
> F2.
> **Decisión de S1.3 cerrada**: dentro de la fase **no se ordena**. Un pluvider que consuma de otro
> puede perderse los primeros eventos; se asume y se documenta, antes que montar un grafo.

- Tres fases fijas: providers → pluviders → plugins
  ([index.ts:1721-1780](../../back/src/index.ts#L1721-L1780)).
- Los canales ya se **instancian** antes de resolver providers (F4), así que solo se reordenan los
  **arranques**, no la instanciación.
- **Riesgo del PRD §10 a cerrar aquí**: dentro de la fase de pluviders el orden **no** está
  garantizado, así que un pluvider que consuma de otro puede perderse los primeros eventos. Decisión
  propuesta: **no se ordena** (nada de grafos, es justo lo que D3 vino a evitar) y se documenta como
  limitación para autores. Si aparece un caso real, se revisa.

**Checks**: test que verifica que un consumidor encuentra su pluvider al arrancar; regresión de que
los providers `events` y `metrics` siguen levantándose y sirviendo igual.

### S1.4 — Dependencia blanda (RF4 / D15) — *código escrito, checks técnicos verdes*

> **Entregado (2026-09-18)**: `findMissingSubscriptionTargets()` en
> [back/src/providers/Pluvider.ts](../../back/src/providers/Pluvider.ts), llamada desde
> [index.ts](../../back/src/index.ts) al calcular los providers requeridos. Recorre lo que los canales
> **piden**, no lo que hay registrado, y separa lo ausente en dos listas: providers (→ `logError`,
> mala configuración) y pluviders (→ `logWarning`, ausencia legítima).
> `tsc --noEmit` limpio y **suite del back 288/288** (8 tests nuevos en
> [back/tests/providers/pluviderSoftDependency.test.ts](../../back/tests/providers/pluviderSoftDependency.test.ts),
> antes 280).
> **Hallazgo**: el `logError` de provider no registrado que ya existía era **inalcanzable** —
> `requiredProviders` se construye iterando `registeredProviders.keys()`, así que el `get()` siguiente
> siempre encuentra. Es decir, hasta ahora un provider declarado y no registrado **no se reportaba en
> el arranque**; solo al intentar suscribirse. Corregido en [DECISIONS.md](./DECISIONS.md) y arreglado
> aquí para los dos mundos. El `else` muerto se deja como está: quitarlo es otro frente.

- Productor ausente → el consumidor arranca y funciona.
- Nivel **warning** cuando el que falta es un pluvider; `logError` intacto cuando es un provider
  declarado en `requirements`.

**Checks**: test con productor ausente — el canal arranca, no lanza, y el aviso sale con el nivel
correcto.

---

## F2 — Agora, primer productor — *MVP VALIDADO EN VIVO (2026-09-18)*

**MVP de la fase**: una alerta proactiva real de Agora llega a otro plugin in-process.

> ✅ **Validado por el usuario contra el dev**: `provider-debug` se suscribió a `plugin:agora` y
> recibió una alerta proactiva **real**, la misma que salió por Agora. Criterio de aceptación 1
> cumplido, y sin que Agora publique ningún endpoint nuevo.
>
> Para llegar ahí hubo que meter `provider-debug` en `back/kwirth-dev.json` y reconstruir su dist: el
> core lo estaba cargando como **extensión instalada**, con un `back.js` anterior, y por eso la
> suscripción fallaba con el mensaje antiguo (`Provider ... is not running`).

### S2.1 / S2.2 — Agora se declara pluvider, engancha su fan-out y publica su ayuda — *código escrito, checks técnicos verdes*

> **Entregado (2026-09-18)**: `AgoraChannel implements IChannel, IPluvider`
> ([plugins/agora/src/back/index.ts](../../plugins/agora/src/back/index.ts)). Segunda lista de
> destinatarios (`pluviderSubscribers`) en el **mismo** `pushAlertToSubscribers`, con la misma
> `IAgoraAlert`. Sin filtro en el MVP (D17), y `getSubscriptionHelp()` explicando qué se recibe, que
> el tipo es `IAgoraAlert` y que Agora es SINGLE.
> `tsc --noEmit` limpio y **suite de Agora 220/220** (9 tests nuevos en
> [plugins/agora/tests/back/pluvider.test.ts](../../plugins/agora/tests/back/pluvider.test.ts)).
> Regresión de federación verde: `ALERT_SUBSCRIBE`, el push al socket remoto y el drop al desconectar
> siguen pasando.
>
> **Filtro por clase de alerta (2026-09-18, pedido por el usuario)**: `EAgoraAlertKind` en el `common`
> de Agora con `artifacts` (reglas proactivas sobre eventos del cluster) y `metrics` (el detector de
> anomalías), y suscripción `{ kinds: EAgoraAlertKind[] }`. Vacío = todas, **incluidas las que se
> añadan en el futuro**: un consumidor escrito hoy no se queda fuera de una clase nueva sin enterarse.
> Y en cualquier caso solo llega lo que el **administrador** tenga activado — sin reglas proactivas no
> hay alertas de `artifacts` por mucho que se pidan. Las cuatro emisiones quedaron etiquetadas
> (2 proactivas, 2 de métricas).
> El campo `kind` de `IAgoraAlert` es **opcional a propósito**: ese mismo mensaje viaja por federación
> a otros clusters, y un Agora anterior no lo manda — ausente significa "no se sabe", no "ninguna".
> Una clase desconocida en la suscripción **se descarta** en vez de entrar en el filtro: si entrara,
> la suscripción no casaría con nada y el consumidor se quedaría mudo.
> **Suite de Agora 225/225** (14 en total en el fichero del pluvider), federación verde.
>
> **Tres cosas del camino**:
> - El guard de `pushAlertToSubscribers` cortaba si no había **sockets** suscritos. Había que
>   cambiarlo o el caso normal —nadie federado y un plugin local escuchando— no habría entregado nada.
>   Hay un test dedicado a eso.
> - El id de origen (`plugin:agora`) se escribe **literal** en el plugin en vez de importar
>   `PLUVIDER_ID_PREFIX` de common: un export nuevo de common no existe en el runtime del plugin hasta
>   que el core se reconstruye, y un `undefined` ahí dejaría el evento sin origen.
> - `startProvider()` de Agora no levanta nada: el motor proactivo se construye en el constructor y la
>   producción cuelga de las suscripciones a `events`/`metrics` que se hacen en `startChannel`. Funciona
>   porque el consumidor también se suscribe en **su** `startChannel`, o sea en la misma fase.
>   Matiza RF7 y está comentado en el código.
> - `plugins/agora` tenía un conflicto de peer deps **preexistente** (react 18 vs react-dom 19, y
>   `react-dom` ni siquiera instalado): la actualización a `common-back@0.5.46` se hizo con
>   `--legacy-peer-deps`, autorizado por el usuario.

### S2.1 (original) — Agora se declara pluvider y engancha su fan-out

- Agora **ya tiene** el punto de emisión y la lista de suscriptores: `alertSubscribers`,
  `onAlertSubscribe`, `pushAlertToSubscribers`
  ([agora:444-460](../../plugins/agora/src/back/index.ts#L444-L460)) (F8). Se añade la **segunda lista
  de destinatarios** (canales in-process) en ese mismo punto. No se toca la producción de alertas.
- El payload es `IAgoraAlert`, ya público en su `common`
  ([AgoraTypes.ts:395](../../plugins/agora/src/common/AgoraTypes.ts#L395)) (D9).
- Agora se suscribe a sus propios providers dentro de `startChannel()`
  ([agora:227-243](../../plugins/agora/src/back/index.ts#L227-L243)); hay que comprobar que con el
  orden de S1.3 su producción de alertas sigue viva al arrancar en la fase anterior (riesgo del PRD
  §10, primera fila).

### S2.2 — `getSubscriptionHelp()` de Agora

- `usage` / `example` / `fields` describiendo qué se recibe y qué filtro admite (RF6).
- **Filtro (Q6/D12)**: decidir si el MVP entrega **todas** las alertas y filtra el consumidor —hay
  precedente: `tick`, `sugarless` y `syslog` no filtran (F12)— o si admite filtro por `cluster` /
  `object`. **Propuesta: sin filtro en el MVP**, y se añade cuando un consumidor real lo pida.

**Checks**: un consumidor declara `requirements.providers: ['plugin:agora']`, se suscribe y recibe una
alerta real (criterio de aceptación 1). Regresión: la federación por websocket sigue entregando igual,
y las alertas siguen llegando a las salas.

---

## F3 — Que se vea y que avise

**MVP de la fase**: el usuario ve qué pluviders hay, de quién son, y el core le avisa de las
coincidencias de nombre.

### S3.1 — Avisos de coincidencia (RF8 / D16) — *código escrito, checks técnicos verdes*

> **Entregado (2026-09-18)**: `findNameCollisions()` y `warnNameCollisions()` en
> [back/src/providers/Pluvider.ts](../../back/src/providers/Pluvider.ts), llamadas desde los **tres
> momentos** y en las **dos direcciones**:
> - arranque del core, tras poblar el registro ([index.ts](../../back/src/index.ts));
> - al instalar un **plugin** que resulta ser pluvider y choca con un provider ya registrado;
> - al instalar un **provider** que choca con un pluvider ya presente — tanto por
>   `POST /install` como por `POST /upload` ([ProviderApi.ts](../../back/src/api/ProviderApi.ts)),
>   porque subir el tgz a mano instala igual.
>
> El aviso dice **qué hacer**, no solo que hay un choque: *subscribe to `agora` for the provider and to
> `plugin:agora` for the plugin*. **Nunca rechaza** una instalación: las dos extensiones pueden ser de
> terceros y el usuario no controlar ninguna.
> **Suite del back 305/305** (8 nuevos en
> [tests/providers/pluviderNameCollision.test.ts](../../back/tests/providers/pluviderNameCollision.test.ts),
> antes 297).

Tres momentos, **dos direcciones**:

1. al instalar un plugin con pluvider que choca con un provider ya instalado
   ([PluginManager](../../back/src/tools/PluginManager.ts));
2. al instalar un provider que choca con un plugin con pluvider ya instalado
   ([ProviderManager](../../back/src/tools/ProviderManager.ts));
3. en el arranque del core, uno por coincidencia viva.

**Nunca se rechaza la instalación.**

**Checks**: criterio de aceptación 3 — instalar en los **dos** órdenes posibles y ver el aviso en
ambos, con las dos extensiones direccionables (`XX` y `plugin:XX`).

### S3.2 — Visibilidad (RF9) — *back de `provider-debug` adelantado en F2*

> **Entregado (2026-09-18, parte back)**: `provider-debug` es el **primer consumidor** de pluviders.
> Los lista en su catálogo marcados con `pluvider: true` y su `description`, resuelve la suscripción
> por prefijo contra `clusterInfo.pluviders`, y da un mensaje propio cuando el pluvider no está (el de
> provider se deja **intacto**). Tipo `ISubscribable` para lo único que necesita de un productor —
> `addSubscriber`/`removeSubscriber`—, sea provider o pluvider.
> **Suite de provider-debug 40/40** (9 nuevos en
> [tests/back/pluvider.test.ts](../../plugins/provider-debug/tests/back/pluvider.test.ts) + `FakePluvider`
> en los helpers).
> Detalle que sale gratis y merece quedar dicho: `provider-debug` **no declara nada** en
> `requirements.providers` y aun así depura pluviders, porque un pluvider existe por estar su plugin
> instalado, no porque alguien lo requiera.
> **Front de `provider-debug` hecho (2026-09-18)**: en el desplegable, un pluvider lleva chip `plugin`
> y su descripción al lado; el chip `not running` sigue siendo el que marca lo que no se puede usar.
> Y se corrigió el texto de ayuda, que decía *«A provider only runs when some channel requires it»* —
> cierto para un provider, **falso para un pluvider**, que corre porque su plugin está instalado.
> `tsc` limpio, suite 40/40, dist reconstruido.
>
> **Gestor de providers hecho (2026-09-18)**. Decisión del usuario: **se ven ahí, como ayuda**, pero
> ni desinstalables ni configurables — la configuración, si hiciera falta, es la de su plugin. Todo
> **declarado en el descriptor**, así que llega a las ONCE vistas sin tocar ninguna maquetación:
> - chip `pluvider` con tooltip, `canUninstall`/`canConfigure` denegados **con su motivo** (control
>   visible y deshabilitado, que es la norma del proyecto), y sin contador de configs.
> - **Nombre y versión son los del plugin**, resueltos vía `PluginManager` (`getPluginInfo`): un
>   pluvider no se nombra ni se versiona aparte. Antes se pintaba `vplugin`, de un literal que puse yo.
> - **Procedencia**: `installedFrom: 'plugin:<id>'`, con la misma convención que el `pack:<id>` que ya
>   existía. En [MarketplaceBadge.tsx](../../front/src/components/extensions/MarketplaceBadge.tsx) eso
>   da icono de **extensión** y chip con el **nombre del plugin**. ⚠️ Sin este caso caía en el fallback
>   y se anunciaba como servido por el **marketplace público** — falso, y con un plugin de pago lo
>   habría anunciado como OSS.
> - Subtítulo: `Subscribe with id: plugin:agora`, porque al llamarse ya como su plugin el id deja de
>   verse, y es lo que hace falta para suscribirse.
> - **Suite del back 297/297**.
>
> **Corrección (2026-09-18), tras probarlo el usuario**: `plugin:agora` no aparecía en el desplegable.
> El motivo no era el pluvider: **el front de `provider-debug` no usa el catálogo del websocket** —
> puebla la lista con `GET /core/providers` ([ProviderDebugSetup.tsx:33-44](../../plugins/provider-debug/src/front/ProviderDebugSetup.tsx#L33-L44))
> y el catálogo del canal es solo el plan B. Y ese endpoint no conocía los pluviders.
>
> **Decisión del usuario: transparencia.** Quien CONSUME productores sigue pidiendo `/core/providers`
> y no tiene que saber que existen pluviders. Así que se sirven en **la misma lista**, marcados con
> `pluvider: true` + `hostedBy` para el único que sí necesita distinguirlos: el gestor de extensiones,
> porque un pluvider no se instala ni se desinstala por separado.
> - [ProviderApi.ts](../../back/src/api/ProviderApi.ts): los pluviders vivos entran en `GET /core/providers`.
> - [ProviderDescriptor.ts](../../front/src/components/extensions/ProviderDescriptor.ts):
>   `filterInstalled: p => !p.core && !p.pluvider`. **Una línea, y en el único punto de filtrado** —
>   no hay que tocar ninguna de las ONCE vistas del gestor.
> - **Suite del back 294/294** (6 nuevos en
>   [tests/api/providerApiPluviders.test.ts](../../back/tests/api/providerApiPluviders.test.ts), antes 288).

- El pluvider aparece como productor en el gestor de extensiones y en `provider-debug`, distinguible
  de un provider instalado y marcado como **no desinstalable por separado** (se va con su plugin).
- ⚠️ El gestor de extensiones son **once** vistas (instalados/disponibles × tarjeta/lista): auditar
  por script **antes** de tocar nada, según el criterio de
  [plans/extension-managers-ui/PLAN.md](../extension-managers-ui/PLAN.md).
- `provider-debug` debe poder explicar la suscripción a partir de `getSubscriptionHelp()` sin mirar
  código (criterio de aceptación 5).

**Checks**: e2e sobre `provider-debug` y sobre el gestor; criterios de aceptación 4 y 5.

### S3.3 — Documentación: website + docu 0.6.31 — *escrita*

> **Entregado (2026-09-18)**:
> - **Página propia del concepto**: [docs/0.6.31/plugins/pluviders.md](../../docs/0.6.31/plugins/pluviders.md)
>   — el problema, por qué no basta un provider, el mecanismo (con diagrama del punto de emisión y sus
>   tres puertas), cómo se declara, cómo se consume, la dependencia blanda y su diferencia de severidad,
>   el identificador y las colisiones, el orden de arranque en tres fases con sus dos consecuencias,
>   qué se ve en la UI **y por qué**, y las limitaciones (`SINGLE`/REMOTE, in-process).
> - **Enlazada** desde el sidebar (bajo *Autonomous plugins*), desde `plugins/autonomous.md`,
>   `plugins/developing.md`, `providers/index.md` y `providers/developing.md` — este último con un
>   aviso al principio: si la información la produce el plugin que estás escribiendo, un provider
>   aparte duplicaría el trabajo.
> - **Website**: sección nueva en [docs/plugins.html](../../docs/plugins.html) y en
>   [docs/providers.html](../../docs/providers.html).
> - **tgz regenerado** con `back/scripts/build-docs-tgz.js` (v0.6.31, 440 ficheros, la página dentro).
>   ⚠️ Falta **reiniciar el back** para que se sirva la nueva.
> - Diagrama ASCII verificado por código: bordes en las columnas 22 y 55, ramas en 27/37/47.

### S3.3 (original) — Documentación: website + docu 0.6.31

El pluvider es **del core**, así que se documenta en los dos sitios:

- **Website** (HTML en la raíz de `docs/`): el concepto vive entre
  [docs/plugins.html](../../docs/plugins.html) y [docs/providers.html](../../docs/providers.html) —
  decidir si va en uno, en otro o en los dos.
- **Docu versionada `docs/0.6.31/`**: encaja en `plugins/autonomous.md` (que ya trata el plugin con
  back autónomo, que es justo el productor típico), `plugins/developing.md` y
  `providers/developing.md`, más lo que toque en `developing/back.md`.
- ⚠️ Editar el markdown **no basta**: hay que regenerar el tgz con `build-docs-tgz.js` y reiniciar el
  back, o se sigue sirviendo la guía vieja.

**Checks**: la documentación explica el **funcionamiento** —por qué un pluvider no pasa por la
maquinaria de providers, por qué el id lleva prefijo, y qué pasa cuando el productor no está— y no
solo describe pantallas.

---

## F4 — Montag como productor — *código escrito, checks técnicos verdes*

> **Alcance recortado por el usuario (2026-09-18)**: **Censor se queda fuera**. Solo Montag, y lo que
> publica son sus **issues**.
>
> **Entregado**: `MontagChannel implements IPluvider`
> ([plugins/montag/src/back/index.ts](../../plugins/montag/src/back/index.ts)), con el tipo público
> `IMontagIssueEvent` en su `common` (runnerKey, text, explanation, tags y **timestamp**, que en la
> pestaña Issues se pierde). La entrega se engancha en el **mismo bucle** que ya repartía cada issue al
> front y, si el runner tiene sender, al sender: es una tercera puerta, no un pipeline nuevo.
> **Filtro por config** (pedido por el usuario): la suscripción lleva `{ configs: string[] }`, nombres
> de config cuyos issues se quieren. Vacío o ausente = todas — deliberado: una suscripción incompleta
> acaba recibiendo de más, que se nota, en vez de caer en un silencio inexplicable. Cada suscriptor
> tiene su lista, re-suscribirse la **reemplaza**, y lo que llega se **sanea** (viene de otro plugin).
> Por eso el evento lleva `configName` suelto además de `runnerKey`: filtrar no debe obligar a parsear
> una cadena.
> `tsc --noEmit` limpio y **suite de Montag 65/65** (16 nuevos en
> [tests/back/MontagPluvider.test.ts](../../plugins/montag/tests/back/MontagPluvider.test.ts)).
>
> **Hallazgo de funcionamiento, a raíz de una pregunta del usuario**: los issues solo fluyen mientras
> una sesión **analiza**, y la sesión que abre el tab de Montag es **efímera** — `removeConnection` la
> para en cuanto el front se desconecta. El **autostart no ayuda**: el propio código dice que solo
> aplica a esa sesión efímera. Para consumo desatendido hace falta una **sesión con nombre**
> (`ephemeral: false`), que además se restaura al arrancar el canal. Recogido en `getSubscriptionHelp()`
> y en la guía, porque es la causa número uno de "me he suscrito y no llega nada".
> **Guía**: [admin/06-issues-for-other-plugins.md](../../plugins/montag/docs/guide/admin/06-issues-for-other-plugins.md)
> y su entrada en el sidebar. ⚠️ **Falta regenerar `montag.tgz`** — y hay que decidir antes si eso
> arrastra bump de versión del plugin.
>
> **Confirmación de diseño**: Montag declara `providesRouter = true` y tiene router propio. Es
> exactamente el escenario de la colisión que motivó `publications[]` (D2) — y **no ocurre**, porque un
> pluvider no entra en `clusterInfo.providers` (D18). El registro aparte se paga solo.

## F4 (original) — Censor y Montag como productores

**MVP de la fase**: los mensajes de log ya filtrados salen por la puerta in-process (CU2, CU3).

Se aborda cuando F1–F3 estén cerradas y con el aprendizaje de Agora encima. Cada uno publica el tipo
de su evento en su propio `common` (D9) y su `getSubscriptionHelp()` (RF6).

---

## F5 — `iter` como productor de **estado** — ⬜ pendiente

**MVP de la fase**: el mapa de negocio de `iter` —qué workload sirve a qué servicio de negocio, con
su criticidad, su owner y sus dependencias declaradas— queda disponible in-process para cualquier
canal que se suscriba. Es información que hoy solo existe dentro de `iter` y que ningún otro plugin
puede aprovechar.

⚠️ **Esta fase no es "otro productor más": es el primero de una clase distinta, y conviene verlo
antes de diseñar F1.**

**1 · No hay punto de emisión que reutilizar.** El argumento que abarata F2 es F8: *Agora ya tiene el
fan-out montado para federación, así que el pluvider es una tercera puerta en el mismo punto de
emisión*. En `iter` **eso no existe**: solo mantiene websockets hacia sus propios fronts
([iter/src/back/index.ts:47](../../plugins/iter/src/back/index.ts#L47)). El punto de emisión hay que
construirlo.

**2 · Emite estado, no eventos.** Agora, Censor y Montag empujan **sucesos** (una alerta, una línea
de log): quien llega tarde se ha perdido lo anterior, y da igual. `iter` publica un **grafo
versionado**: un consumidor que se suscribe necesita **el mapa entero**, no los cambios desde que
llegó. Con push puro y sin más, un consumidor que arranque después de `iter` no vería nada hasta la
siguiente edición del mapa — que puede ser semanas.

**3 · Pero NO necesita el `ask()` de la Fase 2.** El patrón correcto para estado es **snapshot al
suscribirse + delta al promocionar versión**, y eso es push puro, dentro del MVP. Hay precedente
directo en el core: `EventsProvider.addSubscriber(c, { kinds, syncInstances })`, donde
`syncInstances` significa exactamente *"mándame el estado actual al suscribirme"* — y el propio
`iter` **ya lo usa como consumidor** ([iter:77](../../plugins/iter/src/back/index.ts#L77)).

**Consecuencia para F1**, y es el motivo de anotar esto ahora y no cuando toque: el contrato de
`S1.1` debe dejar sitio a que un pluvider **entregue estado inicial en `addSubscriber`**, no solo a
que empuje eventos después. Si F1 se cierra pensando únicamente en productores de sucesos, esta fase
obliga a reabrirlo.

### S5.1 — Punto de emisión del mapa

`iter` mantiene la lista de suscriptores in-process y emite cuando el mapa cambia de versión
(promoción staging → producción, §28 de su PRD). El payload lo publica en su propio `common` (D9).

### S5.2 — Snapshot en `addSubscriber`

Al suscribirse, el consumidor recibe el mapa vigente completo. Filtro de suscripción y forma del
evento, en `getSubscriptionHelp()` (RF6).

### S5.3 — Verificar el caso `SINGLE` / desktop

Q7 y F11 aplican: si `iter` resultara `SINGLE`, en desktop y docker no se instancia localmente y
**no habría pluvider al que suscribirse**. Hay que comprobarlo y decidir qué ve el consumidor en ese
caso, igual que con Agora.

---

## Fase 2 (fuera de este PLAN)

Lo que el PRD §9 deja fuera del MVP, en este orden de interés:

1. **`ask()` — la cara de consulta (pull)**, para Situs (CU4).
2. **`publications[]`** — separar la publicación en un array con `kind` / router / alias (D2/D7).
3. **Descubrimiento en runtime** de pluviders disponibles (Q9).

---

## Cierre

- Por **stream**, no por fase: la checklist de cierre de 9 puntos, **secuencial**, con el punto 3 (QA
  manual) como **gate** — del 4 al 9 no se toca nada hasta que valides.
- Punto 2: e2e + `test-metrics-history.md` + los 2 PNG generados con
  `node tools/gen-coverage-chart.mjs`.
- Punto 4: la guía. Esto es una capacidad **para autores de extensiones**, así que va a la
  documentación del core, que **ahora está en `docs/0.6.31/`** (guía en `docs/0.6.31/guide/`), más el
  website de la raíz de `docs/` — ver S3.3. Editar el markdown **no basta**: hay que regenerar el tgz
  con `build-docs-tgz.js` y reiniciar el back, o se sigue sirviendo la vieja.
- Mis trazas de depuración se retiran al terminar el PLAN completo, no al cerrar cada stream.

---

## Ajustes posteriores (2026-09-18/19)

Todo esto sale de probarlo en vivo, y una parte son fallos que los tests no cubrían.

### 🐛 El registro se quedaba con la instancia vieja tras un hot-reload

**Síntoma**: la pestaña Form de `provider-debug` no se habilitaba aunque el pluvider ya publicara sus
`fields`. **Causa**: en el hot-reload de un plugin de dev el core crea una instancia nueva del canal y
la mete en `ri.channels`, pero **el registro de pluviders seguía apuntando a la anterior**. El core le
pedía el `getSubscriptionHelp()` a un objeto que ya nadie usaba, y servía lo que decía el código
anterior. Peor aún: los suscriptores quedaban enganchados a una instancia muerta.

Arreglado con `rebindPluvider()` ([Pluvider.ts](../../back/src/providers/Pluvider.ts)): para la vieja,
da de alta la nueva y arranca su producción, todo antes de `startChannel()`. Extraído a función **para
poder testearlo**, porque este camino falló sin que ningún test se enterara — 7 casos nuevos, incluido
quitar `getPluviderData` y recargar (el registro tiene que quedar limpio).
**Límite conocido, ahora avisado en el log**: los suscriptores de la instancia anterior **no se pueden
migrar**; hay que recargar también al consumidor.

### Filtros de suscripción en los dos productores

- **Montag**: `{ configs: string[] }` — analiza varias configs a la vez, así que el consumidor dice de
  cuáles quiere los issues. Vacío = **todas las activas** (una config inactiva no tiene runner y no
  produce nada, así que no hay más "todas" que esa).
- **Agora**: `{ alerts: EAgoraAlertType[] }` — `artifacts` (reglas proactivas) y `metrics` (detector de
  anomalías). Vacío = todos, **incluidos los que se añadan en el futuro**. Y solo llega lo que el
  **administrador** tenga activado.
- Nombrado: se descartó `kinds` por sonar a Kubernetes. Renombrado en los **tres** sitios —`alerts` en
  la suscripción, `alertType` en el evento, `EAgoraAlertType` en el enum—, sin tocar los `kind`
  legítimos de Agora (`EAgoraMemberKind`, `EK8sChangeType`, los triggers).

### El ejemplo de suscripción se construye con estado REAL

`getSubscriptionHelp()` es un método de la **instancia**, así que puede mirar lo que está pasando.
Montag devuelve como ejemplo las configs que **están analizando ahora mismo**, sacadas de sus runners
vivos (no del storage: una config guardada sin runner no entrega nada). Si no hay ninguna, cae a
nombres de muestra **y lo dice**. Así `USE EXAMPLE` deja en el formulario la instalación del usuario,
no un ejemplo de manual.
**Es una propiedad del contrato que conviene contar en la documentación**: cualquier pluvider puede
construir su ayuda con su estado vivo.

### Diálogo de setup de `provider-debug`

- 🐛 **No se podía volver a Form desde JSON**: el `Tab` estaba envuelto en `<Tooltip><span>`, y `Tabs`
  inyecta el `onChange` **clonando sus hijos directos** — envuelto, nunca lo recibía. Venía de antes
  del pluvider.
- **Tres pestañas**: Overview (la que se abre al elegir productor, con la descripción y el
  `USE EXAMPLE`), Form y JSON. `USE EXAMPLE` rellena el payload y **salta a Form** — el formulario y el
  JSON editan el mismo estado, así que no hay dos sitios que sincronizar.
- Todo lo del productor va **encuadrado** y titulado con su id: ni la descripción ni los campos son del
  diálogo, y cambian por completo al elegir otro.
- El cuadro **ocupa el alto disponible** (el diálogo es de alto fijo y se reparte por flex; el selector
  y Max events con `flexShrink: 0` para que su texto de ayuda no se comprima), y las pestañas quedan
  **deshabilitadas sin productor elegido**.
- El estado "canal no arrancado" pasa a ser el de Agora e Iter: titular + instrucción, **centrado**.

---

## Cierre CL9 (2026-09-19)

**QA manual validado por el usuario (punto 3, el gate): todos los pasos.**

### Punto 1 — harness

| | Tests |
|---|---|
| back (core) | 313/313 |
| agora | 225/225 |
| montag | 68/68 |
| provider-debug | 41/41 |

### Punto 2 — e2e y métricas

**e2e nuevos (8)**: 6 en `provider-debug` (`02-pluviders.spec.ts`) y 2 en el gestor de providers del core
(`front/e2e/tests/providers-manager.spec.ts`). **No se escribieron en Agora ni Montag a propósito**: el
pluvider no tiene superficie en su propio front — se ve en provider-debug y en el gestor —, y ponerles
specs que navegan por otro plugin sería colocarlos donde no viven.

**e2e ajenos arreglados (5+3)**: el rediseño del diálogo obligó a adaptar 5 (el estado vacío pasó a dos
elementos, el editor JSON vive ahora en su pestaña, cambió el texto de ayuda), y **3 estaban mal de
antes**: dos se ataban a `kafka` por id y se pusieron rojos el día que dejó de estar instalado, y uno
contaba pluviders como si fueran extensiones instalables.

🔴 **La cobertura estaba MAL MEDIDA, y el hallazgo vale más que el número.** El runner bundlea *un
fichero por test*, y cada bundle arrastra su **propia copia del `src`**. El informe los trata como
ficheros distintos y hace la **media** de esas copias en vez de la unión: cada test cubría bien su
parcela y sumaba ~1.800 líneas ajenas sin tocar. El bundle del pluvider de Montag lo delataba —
**21% de líneas con 95% de ramas**.

Arreglado con un **entry único** cuando `COVERAGE=1` (una sola copia del `src`); sin la variable, la
ejecución sigue siendo un proceso por fichero, que aísla mejor.

| | Medido antes | **Real** |
|---|---|---|
| Montag | 38.41 / 59.51 / 48.64 | **77.44 / 80.61 / 85.19** |
| Agora | 74.28 / 83.24 / 76.72 | **93.91 / 86.87 / 94.13** |
| provider-debug | 90.70 / 85.98 / 80.00 | **97.47 / 91.19 / 89.74** |

No hizo falta escribir un solo test: el código ya estaba cubierto. Históricos y los 6 PNG regenerados,
con la nota de que el salto es **de medición, no de tests**.

⚠️ **Deuda conocida en Agora**: al medir con entry único, 2 de los 225 fallan
(`listRoomsForMember`, `insertMessage + listBacklog`). No es el código: `setupPgTest` aísla por
`agoratest_<suffix>_<pid>` pero guarda el consumidor en una **variable de entorno global**, así que en
un solo proceso el último import pisa a los demás. Con `npm test` normal siguen pasando 225/225 — el
rojo solo aparece al medir. Decisión del usuario: dejarlo así y anotar el arreglo del aislamiento.

### Punto 4 — guía

- Core: la página del concepto se **completó** con lo que faltaba (se escribió antes de que existieran
  los filtros): la tabla de payloads de los dos productores, por qué lista vacía = todo, sanear lo que
  llega, que lo que el administrador tenga activado manda, y **construir la ayuda con estado vivo**.
- `plugins/montag/docs/guide/admin/06-issues-for-other-plugins.md` (nueva).
- `plugins/agora/docs/guide/admin/10-alerts-for-other-plugins.md` (nueva), con su entrada de sidebar.

### Puntos 7-9 — commit, tag y push

⚠️ **Agora y Montag no se pueden commitear en este repo**: `plugins/agora/` y `plugins/montag/` están
excluidos en `.gitignore` y en `.git/info/exclude` (guardarraíl anti-fuga). Su código, sus tests, sus
guías, sus métricas y el `BACKLOG.md` de otra sesión van por su repo privado + Nexus + manifest.
**Sin bump de versión no hay tag**: ninguna de las tres extensiones ha cambiado de versión en este
cierre.

## Backlog que deja este trabajo

- **Aislamiento de BD en los tests de Agora**: `AGORA_DB_CONSUMER` es una variable de entorno global;
  debería resolverse por fichero en runtime para que la suite se pueda ejecutar en un solo proceso.
- **`updateSubscriber` de `ClusterInfo` sigue vacío** (`//+++ review how to implement`), también para
  providers. Es un frente propio que afecta a los dos mundos.
- **Fase 2 del pluvider**, fuera del MVP por decisión: `ask()` (la cara de consulta, para Situs),
  `publications[]` (separar la publicación en un array con kind/router/alias) y el **descubrimiento en
  runtime** de qué pluviders hay (Q9).
- **Q7**: qué ve un consumidor donde el productor no está hospedado (hoy: warning y sigue).
- Publicación privada pendiente de Agora y Montag, con el **lockstep** de versión y el `montag.tgz`.
