# Provider handle — lo que el core entrega a un consumidor deja de ser el provider — Plan

> **ESTADO — SIN EMPEZAR** (acordado con el usuario el 2026-09-24; el arranque espera a que termine el
> refactor en curso del core, `DockerTools` → `ExecutionEnvironment`).
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
- **H2 — migrar los consumidores, uno a uno.** Lo pidió el usuario explícitamente: *"luego revisamos
  todos los providers y suscriptores para asegurarnos que usan el nuevo interfaz"*. Son sugarless,
  situs, provider-debug (los tres de la vía directa) y excubitor, agora, iter, montag (los que ya
  pasan por el core y cambian de API). ⚠️ Uno a uno y mirando el código de cada uno: nada de un
  script global.
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
