# Provider handle — lo que el core entrega a un consumidor deja de ser el provider — Plan

> **ESTADO — EN PRODUCCIÓN lo esencial** (2026-09-25). El handle existe en el core y está publicado
> (`common-back` 0.5.52); el logger de providers está cableado y publicado en los 13 que escribían por
> `console.log`. Queda **H2**, y queda a propósito: ver abajo por qué se decidió NO migrar a los diez
> consumidores que ya pasan por el core.
> Plan **append-only**: se marca, no se borra. Si contradice al producto, gana el producto.

## De dónde sale esto

De pintar el grafo de Kwirth Status (`plans/kwirth-status/PLAN.md`, cerrado) y encontrarlo **vacío**
mientras la propia pantalla listaba providers con suscriptores y con entregas. El fallo no era del
plugin: el grafo es incompleto **por construcción**, y al tirar del hilo aparecieron tres averías con
una sola raíz.

## La raíz

`clusterInfo.providers` entrega el **objeto `IProvider` real** — la misma interfaz que implementa el
autor del provider. Un consumidor puede llamar a `provider.addSubscriber()` y saltarse el core sin
hacer nada raro, porque se le ha dado justo eso. De ahí:

1. **El registro de aristas es opcional.** `ClusterInfo.getSubscriptions()` solo ve a quien pasa por
   `clusterInfo.addSubscriber()`. Hoy **tres consumidores no pasan**:
   `plugins/sugarless/src/back/index.ts:197`, `plugins/situs/src/back/index.ts:610` y
   `plugins/provider-debug/src/back/index.ts:255` (éste a propósito, con su proxy).
   Y no lo hacen por capricho: `startChannel()` se llama **una vez por canal, no por pestaña**, así
   que quien quiera una suscripción por instancia tiene que fabricarse un `IProviderSubscriber`
   propio — lo explica bien el comentario de `IInstance` en sugarless.
2. **La baja es por identidad de objeto.** `IProviderSubscriber` es un método suelto sin identidad y
   cada provider guarda los suyos en un `Map` indexado por el objeto. Si un canal se reinstancia
   (recarga del dev, dos instancias), el provider se queda con **suscriptores fantasma** que nadie
   puede quitar, y el contador que enseña Status los cuenta como vivos.
3. **El core no está en el camino del dato.** Por eso en S3 de Kwirth Status se descartó el caudal por
   arista: medirlo habría exigido una sonda que rompía `removeSubscriber(c)`, que es por identidad.

## El acuerdo: dos interfaces, no una

| hoy | acordado |
|---|---|
| `IProvider` — lo que el autor **implementa**… | …se queda igual, es correcta |
| …y también lo que el consumidor **recibe** | un **handle que fabrica el core**: `clusterInfo.getProvider(id)` → `subscribe(data, onEvent)` · `update(data)` · `unsubscribe()` · `getStats()` |

El handle lo crea el core **por (canal, instancia)**, así que nace sabiendo quién es quién:

- toda suscripción queda registrada sin depender de la buena voluntad del consumidor;
- una suscripción **por pestaña** deja de necesitar proxies artesanales: es lo que el handle es;
- la baja es `unsubscribe()` sobre un handle concreto, no buscar un objeto en un `Map` → se acaban los
  fantasmas;
- el día que se quiera caudal por arista, el core ya está en medio y puede contarlo **sin tocar los 16
  providers**.

Es **aditivo**: `providers[]` se queda —sirve para "¿está instalado?", que es como lo usa agora— y deja
de ser vía de suscripción.

## Streams

- **H1 — el handle en el core.** `getProvider(id)` en `ClusterInfo`, el wrapper, y el registro de
  aristas con **refcount** por handle. Contrato en `kwirth-common-back`.
  - ✅ **HECHO el 2026-09-25.** `clusterInfo.getProvider(providerId, consumer)` devuelve un handle atado
    a las dos puntas; el registro cuenta por **suscriptor** y no por canal, así que un canal con tres
    pestañas es una arista sostenida por tres suscripciones que se va con la última. Contrato publicado
    en `common-back` **0.5.52** (`IProviderHandle`), y mientras npm no lo servía el core declaró su
    propia vista para no bloquearse — cuando se suba la dependencia, esas declaraciones sobran.
  - ⚠️ **La garantía de rendimiento está fijada con un test**: el handle NO envuelve al suscriptor, le
    pasa al provider el mismo objeto que recibe. Envolverlo para contar entregas sería un closure por
    evento, para todos, mire alguien o no. Por eso el **caudal por arista sigue fuera**.
  - `subscribe()` devuelve lo que devuelva el provider: si se lo tragara, un provider que falla al dar
    de alta dejaría un unhandled rejection y se lleva el core por delante. Lo destapó provider-debug,
    que es justo quien se encuentra providers ajenos mal escritos.
- **H2 — migrar los consumidores.** ⏸ **REPLANTEADO el 2026-09-25, y solo se hizo la mitad que valía
  la pena.** El recuento con el que se escribió este plan caducó en unas horas: el usuario migró
  **sugarless y situs a mano** esa misma mañana (`fix(sugarless): una suscripcion del canal, A TRAVES
  DEL CORE`), así que de los tres que se saltaban el core quedaba uno.
  - ✅ Migrados los dos que seguían por fuera: **`echo`** y **`provider-debug`**. El segundo conserva su
    suscriptor por pestaña —para eso existe— y ahora además aparece en el grafo, así que el bypass deja
    de tener motivo.
  - ⛔ **NO se migran los diez que ya pasan por el core** (agora, alert, excubitor, iter, pinocchio,
    situs, status, sugarless, topology, trivy): hoy funcionan y el registro ya los ve, así que cambiarlos
    costaría diez bbpm a cambio de nada inmediato. Cada uno pasa al handle **cuando se toque por otra
    razón**. Lo que el handle aporta ahí es futuro —cerrar la puerta, la baja por suscriptor, la
    suscripción por instancia—, no una avería viva.
  - ⚠️ Mientras tanto, la puerta sigue abierta: `clusterInfo.providers` continúa entregando el objeto
    real, así que saltarse el core sigue siendo posible para quien no use el handle.
- **H3 — Kwirth Status.** Recalibrar la salud con el dato ya correcto y, mientras queden consumidores
  sin migrar, decir en pantalla cuándo `subscribers > knownConsumers` en vez de dar el grafo por
  completo.
  - ✅ **Hecho lo segundo el 2026-09-24** (`plugin/status@0.2.3`): sin aristas ya no se afirma que no
    hay nadie suscrito. Si los hay pero el core no los intermedió, se dice cuántos son y por qué no
    se pueden dibujar, y se remite a la tabla, que sí mide. La cuenta vive en
    `countUnbrokeredConsumers` (front, +6 tests) y un caso e2e cruza las dos vistas: si la tabla dice
    que hay consumo, el grafo o lo dibuja o lo explica.
  - ⏳ Queda lo primero: la salud del provider, que depende de arreglar `started` (abajo).

## Backlog — averías abiertas que salen de aquí

- ✅ **HECHO el 2026-09-25 — el logger de providers (H4, no estaba en este plan y se añadió aquí).** Un
  provider no tenía con qué escribir en el log: a los canales se les presta un `backChannelObject`, a
  un provider no se le daba nada, así que sólo le quedaba `console.log` — sin hora, sin nivel y sin
  componente, con **los fallos indistinguibles de una traza**. `setLogger?()` opcional en el contrato,
  inyectado por el core en `createProviderInstance`, y **117 líneas reclasificadas a mano** en 13
  providers: error cuando algo no ocurrió, warning cuando ocurrió degradado (una cuota sin uso, un CRD
  ausente), info el resto. `longhorn` y `trivy` escribían `[longhorn-provider]` y `[trivy-provider]`,
  que no son sus ids. Publicados los 13 + `common-back` 0.5.52 + `echo` y `provider-debug`.


- 🔴 **`provider.started` no significa "arrancado", significa "tiene el router montado".** Solo se
  asigna en los dos sitios que montan el router (`back/src/index.ts` ~1369 y ~1562); los tres que de
  verdad arrancan un provider (~1358, ~1850, ~1881) llaman a `startProvider()` y no lo tocan. Todo
  provider con `providesRouter = false` —sugarless, trivy— sale **"Not started" de por vida**, y
  Kwirth Status lo pinta como avería con un mensaje que además inventa la causa. **Arreglo**: separar
  `started` (arrancado) de un `routerStarted` nuevo, exactamente como ya convive `configRouterStarted`.
  Es estado interno del core, no del contrato publicado: no arrastra republicaciones.
- ✅ **ARREGLADO el 2026-09-24** (no esperó al handle: el grafo estaba inservible en producción).
  `trackSubscription` deduplicaba y `untrackSubscription` borraba a la primera, así que dos
  suscripciones del mismo canal al mismo provider eran **una** arista —correcto— pero la primera baja
  se la llevaba por delante aunque quedaran suscripciones vivas; con un par de reinstanciaciones el
  grafo se vaciaba solo mientras los providers seguían contando suscriptores. Ahora cada arista guarda
  **sus suscriptores por identidad de objeto**, el mismo criterio con el que el provider los guarda en
  su `Map` —para que el core no pueda afirmar algo distinto de lo que el provider cree—, y desaparece
  cuando se va el último. +10 tests en `back/tests/model/subscriptionRegistry.test.ts`.
  Cuando llegue H1, el handle sustituye esta cuenta por una natural: una suscripción, un handle.
- `ClusterInfo.updateSubscriber()` está **vacío** (`//+++ review how to implement`): quien llame a
  `updateSubscription` a través del core no actualiza nada y no se entera.
