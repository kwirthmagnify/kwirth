# Pluvider — un plugin que expone su informacion tambien in-process

Bitacora de decisiones de diseno. Vive mientras se disena; alimenta el PRD. Append-only.

> **Que es.** Un plugin con back autonomo (corre en background, siempre iniciado) que produce
> informacion valiosa — situs elabora datos de IPs, agora enriquece alertas — y la expone **por
> varias puertas**: a su front como hasta ahora, y **in-process** a otros plugins.
>
> **Que NO es.** No son dos extensiones empaquetadas juntas. Es **un plugin, un back, una
> informacion**, expuesta de varias formas.

## Decisiones tomadas

- **D1 — Un plugin, una clase, una instancia.** El pluvider no es un segundo componente dentro del
  plugin: es la misma informacion por otra puerta. Sin segunda clase, sin segundo dist, sin segunda
  entrada de manifest. *(usuario, explicito)*
- **D2 — La publicacion se separa en una estructura.** En vez de las cuatro propiedades planas de
  hoy (`providesRouter`, `router`, `routerAlias`, `configRouter`), un array `publications[]` donde
  cada cara declara su `kind` (CHANNEL / PROVIDER / CONFIG), su router y su alias. *(usuario:
  "necesitamos separar eso en 2, o incluso un objeto o un array con todo lo relativo a publicar")*
- **D3 — Orden de arranque: providers -> pluviders -> plugins.** Tres fases fijas. Elimina el grafo
  de dependencias y la deteccion de ciclos. Impone que el pluvider debe poder producir sin que
  `startChannel()` haya corrido: el trabajo de fondo vive en el lado provider. *(usuario)*
- **D4 — Descartado el adaptador `getProvider()`.** Existia solo para esquivar la colision de
  routers; D2 mata la colision, asi que cae. La clase del plugin ES el pluvider.
- **D5 — Descartado el shim de WebSocket falso.** Reusar `processCommand` in-process fabricando un
  socket y correlacionando respuestas ata el pluvider al transporte del front. *(propuesto, pendiente
  de que el usuario lo ratifique)*

## Hechos verificados que condicionan el diseno

- **F1 — `IProvider` hoy es push puro.** `addSubscriber` + `processProviderEvent`, sin ningun metodo
  de consulta ([common-back/src/IProvider.ts:62](../../common-back/src/IProvider.ts#L62)). El pull
  no cabe sin anadir algo.
- **F2 — La superficie real hacia el front NO son los endpoints HTTP.** `endpointRequest` esta vacio
  en situs, agora, excubitor, montag, iter, censor, sugarless, alert, news, ops. Solo lo usan de
  verdad fileman, pinocchio y spectrum. Lo que los plugins valiosos exponen a su front son
  **comandos por websocket** (`processCommand`).
- **F3 — `processCommand` no devuelve la respuesta.** Devuelve `boolean` ("lo he atendido"); el dato
  sale fuera de banda por el socket (`webSocket.send` con su `msgtype`)
  ([plugins/situs/src/back/index.ts:313](../../plugins/situs/src/back/index.ts#L313)). No sirve como
  pull directo.
- **F4 — Los canales ya se instancian antes de resolver providers**
  ([back/src/index.ts:1690-1725](../../back/src/index.ts#L1690-L1725)), asi que D3 encaja sin mover
  la instanciacion: solo se reordenan los arranques.
- **F5 — Los routers solo se resuelven en arranque.** Tocar `publications[]` implica
  `requiresRestart`.
- **F6 — Un canal SINGLETON anunciado REMOTE (desktop) no se instancia localmente**, luego su
  pluvider tampoco existe ahi. El suscriptor debe degradar, como hoy con un provider no registrado.
- **F7 — El vocabulario ya existe.** `ESitusCommand` = `CONFIG_GET` / `CONFIG_SET` / `REPORT_GET` /
  `EXPLAIN_GET`, y `EXPLAIN_GET` es literalmente la informacion elaborada de una IP. El pluvider no
  inventa API nueva: es ese mismo vocabulario alcanzable in-process.

## Abierto

- **Q1 — Validar los tipos nuevos**: `EPublicationKind`, `IExtensionPublication`, `publications[]`,
  y el metodo de consulta (`ask`).
- **Q2 — Forma del pull**: `ask(command: string, data?: unknown): Promise<unknown>` con el enum de
  comandos publicado en el `common` de cada pluvider y cast en el consumidor, o algo mas tipado.
- **Q3 — Id del pluvider**: se propone el `channelId` (un plugin, un id, una identidad). Falta
  decidir que pasa si colisiona con un provider instalado.
- **Q4 — Visibilidad**: cualquier plugin instalado puede preguntar, o el plugin declara a quien
  expone.
- **Q5 — Donde vive el PRD**: core V2, o atado a situs como primer consumidor.

---

## Caso de uso principal (usuario, 2026-09-18)

**Agora genera alertas proactivas** (anomalías de métricas, crashes de artifacts). Hoy esa información
acaba en las salas de chat de Agora, pero es interesante para otros plugins. Se quiere que **Agora
exponga una interfaz de tipo provider para que otros plugins se suscriban a esas alertas**.

Es **push**, no pull. Eso reordena el alcance:

- **D6 — El MVP es la cara push.** `addSubscriber` / `removeSubscriber` / `processProviderEvent`, que
  ya existen en el contrato. El pull (`ask`) pasa a fase 2: era extrapolación a partir de situs, no
  el caso que se pide.
- **D7 — D2 (`publications[]`) sale del MVP.** La colisión de routers solo aparece si el pluvider
  quiere publicar router propio; un pluvider que solo empuja alertas no necesita ninguno. La decisión
  sigue siendo buena, pero no bloquea este caso y se puede abordar después.

### Hechos verificados nuevos

- **F8 — Agora YA tiene el fan-out montado, para federación.** `alertSubscribers: Set<WebSocket>`,
  `onAlertSubscribe(ws)` y `pushAlertToSubscribers(cluster, text, object?, reason?)`
  ([plugins/agora/src/back/index.ts:444-460](../../plugins/agora/src/back/index.ts#L444-L460)), con
  payload `IAgoraAlert { cluster, text, object?, reason? }` ya público en su `common`
  ([AgoraTypes.ts:395](../../plugins/agora/src/common/AgoraTypes.ts#L395)). El pluvider es **una
  tercera puerta en el mismo punto de emisión**: una segunda lista de destinatarios (canales
  in-process) junto a la de websockets. No es un pipeline nuevo.
- **F9 — El consumidor no necesita contrato nuevo.** `processProviderEvent` ya está en `IChannel`:
  todo canal sabe recibir. Y **la suscripción no la hace el core**: la hace el propio canal llamando
  a `this.clusterInfo.addSubscriber(providerId, this, data)`
  ([ClusterInfo.ts:61](../../back/src/model/ClusterInfo.ts#L61)), que resuelve por `id` dentro de
  `clusterInfo.providers`. Un plugin se suscribirá a Agora **igual que hoy se suscribe a `events` o
  `metrics`**.
- **F10 — Por tanto el cambio en el core es mínimo**: meter la instancia del canal-pluvider en
  `clusterInfo.providers`. Con eso, `addSubscriber('agora', …)` funciona sin tocar nada más. Lo que
  sí es imprescindible es **D3** (el orden), porque los canales se suscriben dentro de
  `startChannel()` — Agora lo hace en [agora:227-243](../../plugins/agora/src/back/index.ts#L227-L243).
  Si los pluviders se registran antes de que arranque ningún canal, cualquier consumidor los
  encuentra.
- **F11 — Agora es SINGLE** (`instances: EChannelInstances.SINGLE`,
  [agora:111-115](../../plugins/agora/src/back/index.ts#L111-L115)). En desktop/docker se anuncia
  REMOTE y no se instancia localmente, luego **ahí no hay pluvider al que suscribirse**. La puerta
  in-process solo existe donde Agora corre de verdad (in-cluster); para el resto ya está la
  federación por websocket. Es F6 mordiendo justo en el caso principal.

### Abierto (nuevo)

- **Q6 — Filtro de suscripción.** Hoy `onAlertSubscribe` no filtra: todo suscriptor recibe todo.
  ¿El `data` de `addSubscriber` filtra por cluster / objeto / regla, o el MVP entrega todas las
  alertas y filtra el consumidor? Es lo que documentaría `getSubscriptionHelp()`.
- **Q7 — Degradación con Agora REMOTE.** Qué ve un consumidor en un Kwirth donde Agora no está
  hospedado: silencio con log, o algo más.

## Generalización (usuario, 2026-09-18)

Agora es **un ejemplo, no el objetivo**. El mismo mecanismo sirve para que **Censor o Montag** empujen
por su interfaz de provider los mensajes de log que filtran, para quien quiera suscribirse.

- **D8 — Es una capacidad genérica de la plataforma de plugins**, no una feature de Agora. Cualquier
  plugin con back autónomo puede ofrecerse como productor. Esto cierra **Q5**: el PRD es de **core**,
  con Agora / Censor / Montag como primeros productores.
- **D9 — Contrato genérico, payload propio de cada plugin.** El core transporta; el tipo del evento lo
  publica cada plugin en su `common` (`IAgoraAlert` ya existe; censor y montag publicarían el suyo).

### Abierto (nuevo)

- **Q8 — Semántica de la dependencia.** Hoy `requirements.providers` significa "instancia este
  provider". Un pluvider no se puede instanciar a demanda: o su plugin está instalado y corriendo, o
  no está. ¿Dependencia **blanda** (si está, me suscribo; si no, sigo sin él) o **dura** (declarada en
  `requiresExtension` del meta, y el consumidor no instala sin su productor)? La blanda parece lo
  sano; la dura ya tiene sitio en el meta.
- **Q9 — Descubrimiento.** Con productores genéricos, un consumidor puede querer saber en runtime qué
  pluviders hay (como hace provider-debug con los providers), en vez de llevar el id escrito en el
  código. ¿Entra en el MVP o se deja para después?
- **Q10 — Visibilidad y producto.** Montag y Censor son **de pago**. Un plugin gratuito suscrito a su
  flujo obtiene su valor sin pagarlo. Esto sube Q4 de detalle técnico a decisión de negocio.

## Respuestas del usuario (2026-09-18)

- **D10 — Dependencia BLANDA** (cierra Q8). Si el productor está, me suscribo; si no está, el
  consumidor sigue funcionando sin él.
- **D11 — Un pluvider es completamente de pago o completamente público** (cierra Q10 y Q4). No hay
  declaración de "a quién expongo": si un cliente ha comprado un pluvider de pago, puede exponer toda
  la información que quiera — para eso lo ha comprado. La barrera es la compra del plugin productor,
  no una lista de consumidores.
- **D12 — El filtro y el formato son funcionamiento de cada pluvider** (cierra Q6), exactamente como
  pasa hoy con los providers.

### F12 — Revisión de cómo lo hacen hoy los providers (pedida por el usuario)

Confirmado: **no hay contrato común de filtro ni de formato**, cada provider define el suyo.

| provider | filtro (el `data` de `addSubscriber`) | formato del evento |
|---|---|---|
| `business` | `{ spaces: [{ name, types[] }] }` | `{ last: { type, timestamp, event }, all: Map }` — delta **y** estado completo |
| `trivy` | `{ reportTypes: string[] }` (plurales de CRD) | `ITrivyProviderEvent { namespace, podName, containerName, plural, event, report?, kind? }`, más eventos "meta" (`ETrivyEventKind`) con **otra forma** |
| `events` | `{ kinds: string[], syncInstances: boolean }` | evento de cluster |
| `metrics` | `{ container, pod, machine }` (booleanos) | métricas |
| `tick`, `sugarless`, `syslog` | **ninguno** (`addSubscriber(c)` sin `data`) | lo suyo |

Tres patrones de entrega conviven: **solo delta** (trivy), **delta + estado completo** (business:
`last` + `all`), y **estado inicial al suscribirse + deltas después** (trivy `sendInitialState` /
`sendTrivyMeta`). Y hay providers **sin filtro ninguno**, luego "entrego todo y filtra el consumidor"
ya tiene precedente.

Lo que sí existe como contrato común es `getSubscriptionHelp()` (`usage` / `example` / `fields`),
justo para que un consumidor sepa qué escribir sin leer el código. Lo implementan solo 5:
`events`, `metrics`, `http-pull-push`, `service-flow` y `sugarless`. **Recomendación**: que sea
obligatorio de facto en los pluviders, que es donde más falta hace (el consumidor es otro equipo).

### Q11 — Colisión de nombres provider XX / pluvider XX (planteada por el usuario)

Es real y hoy falla en silencio: `ClusterInfo.addSubscriber` resuelve con
`this.providers.find(p => p.id === providerId)` ([ClusterInfo.ts:61-62](../../back/src/model/ClusterInfo.ts#L61-L62)),
o sea **gana el primero del array** y el otro queda invisible, sin aviso. Y hoy nada lo impide: los
ids de plugin y de provider viven en dos `Map` distintos (`registeredChannels` / `registeredProviders`),
únicos cada uno por separado pero **sin unicidad entre ellos** — hasta que el pluvider mete el canal
en el mismo array.

Dos salidas:

1. **Namespace separado** — el pluvider se referencia con prefijo (`plugin:agora`). Imposible
   colisionar, sin depender del orden, sin bloquear instalaciones. Bonus: el id **autodocumenta** la
   dependencia blanda (D10) en el punto de llamada — quien lee `addSubscriber('plugin:montag', …)`
   ve que depende de un plugin instalado. Coste: dos formas de id conviviendo en
   `requirements.providers`.
2. **Id único global validado al instalar** — el core rechaza instalar un plugin cuyo id colisione
   con un provider instalado, y al revés. Coste: el usuario puede quedar bloqueado por dos
   extensiones de terceros que no controla, el conflicto salta en el peor momento, y el orden de
   instalación decide quién gana.

**Recomendación: la 1.**

- **D13 — Nomenclatura `plugin:<nombre>`** (cierra Q11). Un pluvider se referencia siempre con el
  prefijo: `addSubscriber('plugin:agora', …)`, `requirements.providers: ['plugin:montag']`. Namespace
  separado, colisión imposible, y el id autodocumenta la dependencia blanda en el punto de llamada.
- **D14 — La coincidencia de nombre NO bloquea, pero se avisa.** Si existe un provider `XX` y un
  plugin `XX`, técnicamente no hay ambigüedad (namespaces distintos), pero confunde a una persona:
  se avisa **al instalar** y **en el arranque del core**. Nunca se rechaza la instalación.

## Cierre del PRD (2026-09-18)

- **D15 — RF4 no es comportamiento nuevo.** La dependencia blanda es **lo que ya hace hoy el core con
  los providers**: `Required provider '<id>' is not registered` y sigue
  ([index.ts:1755-1758](../../back/src/index.ts#L1755-L1758)); y `Cannot subscribe channel … (provider
  do not exist)` y vuelve ([ClusterInfo.ts:61-69](../../back/src/model/ClusterInfo.ts#L61-L69)). El PRD
  solo lo declara intencional. **Matiz**: hoy los dos son `logError`; para un pluvider la ausencia del
  productor es legítima (puede no estar adquirido), así que ahí el nivel pasa a *warning* — solo para
  pluviders, el provider declarado en `requirements` mantiene su `logError`.
- **D16 — RF8 avisa en las DOS direcciones y en tres momentos**: al instalar un plugin con pluvider
  que choca con un provider ya instalado, al instalar un provider que choca con un plugin con pluvider
  ya instalado, y en el arranque del core por cada coincidencia viva. Nunca se rechaza la instalación.

**PRD cerrado y validado por el usuario.** Siguiente paso: el PLAN (fases y streams).

## Registro compartido vs aparte (2026-09-18)

- **F13 — Con el prefijo `plugin:` los ids NO colisionan, pero el TRATO sí.** Si un canal-pluvider se
  mete en `clusterInfo.providers`, entra en los bucles que recorren ese array y que hacen cosas de
  provider:
  - [index.ts:1486-1497](../../back/src/index.ts#L1486-L1497) monta `provider.router` en
    `/<ri>/provider/<id>` cuando `providesRouter` → **un plugin con router para su front se lo vería
    publicado también en la ruta de providers, que no exige accessKey**. Es la colisión original
    reapareciendo por otra puerta.
  - [index.ts:1275-1277](../../back/src/index.ts#L1275-L1277) escribe `provider.apiKeyApi` si
    `requiresApiKeyApi`.
  - [index.ts:1965](../../back/src/index.ts#L1965) lista "Enabled providers" mezclando ambos.
  - `configure()`, `configRouter` y el flag `started` los escribe el core sobre lo que haya en el array.

  Opciones: **(a)** registro aparte; **(b)** array compartido con guarda en cada bucle —hay que
  acertar en todos, y un bucle futuro sin guarda reabre el agujero—; **(c)** array compartido
  adelantando `publications[]` al MVP, que es justo lo que D7 sacó de él.
  **Recomendación: (a)**, no por los ids sino porque un pluvider no debe pasar por la maquinaria de
  providers.
- **D17 — S1.1, S1.3 y S2.2 validados por el usuario**: los tipos nuevos se le enseñan antes de
  escribirlos y el `id` lo compone el core; dentro de la fase de pluviders **no se ordena** (se
  documenta la limitación); y el MVP de Agora va **sin filtro** de suscripción.
- **D18 — Registro APARTE (opción (a) de F13).** `clusterInfo.providers` sigue siendo solo de
  providers; `ClusterInfo.addSubscriber` discrimina por el prefijo `plugin:` y resuelve contra el
  registro de pluviders. No por los ids —que con el prefijo no colisionan— sino porque un pluvider no
  debe pasar por la maquinaria de providers. **PLAN cerrado y validado.**

## Correccion de F1/D15 (2026-09-18, al implementar S1.4)

Al abrir el camino de `requirements.providers` resulta que **F1/D15 estaba a medias**. Se dijo que el
core, ante un provider declarado y no registrado, "loguea `Required provider '<id>' is not registered`
y sigue". El `logError` existe ([index.ts](../../back/src/index.ts)), pero es **inalcanzable por
construccion**: `requiredProviders` se construye iterando `registeredProviders.keys()`, de modo que el
`registeredProviders.get(provId)` de la linea siguiente **siempre encuentra**.

Lo que de verdad pasaba: si un canal declaraba un provider inexistente, **en el arranque no se
reportaba nada**. El unico aviso llegaba despues, y solo si el canal intentaba suscribirse, desde
`ClusterInfo.addSubscriber`.

No cambia la decision —la dependencia blanda sigue siendo el comportamiento de hoy: no rompe nada—,
solo **donde** se avisaba, que era en ningun sitio. S1.4 lo arregla para los dos mundos: ahora se
recorre lo que los canales PIDEN, no lo que hay registrado, y se reporta lo ausente con el nivel que
le toca a cada uno.
