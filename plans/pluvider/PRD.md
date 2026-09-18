# Pluvider — un plugin que además expone su información in-process — PRD

> Estado: **CERRADO Y VALIDADO** (2026-09-18). Las decisiones que lo sostienen están en
> [DECISIONS.md](./DECISIONS.md) (D1–D14), junto con los hechos verificados del código (F1–F12) que
> lo condicionan. Este documento es de **producto**; el desglose en fases y streams irá al PLAN.

## 1. El problema

Hay plugins con **back autónomo**: corren en background, siempre iniciados, y producen información
elaborada que hoy **solo sabe llegar a su propio front**.

- **Agora** genera alertas proactivas (anomalías de métricas, crashes de artifacts) y las publica en
  sus salas de chat.
- **Censor** y **Montag** filtran mensajes de log y entregan el resultado a su interfaz.
- **Situs** mantiene una foto enriquecida de direcciones IP.

Esa información es valiosa **para otros plugins**, y hoy no hay forma de obtenerla. Un plugin que
quisiera reaccionar a las alertas de Agora tendría que reimplementar la detección; uno que quisiera
los logs ya filtrados por Censor tendría que volver a filtrarlos.

Al mismo tiempo, Kwirth **ya tiene** el mecanismo para distribuir información entre extensiones: los
**providers**. Un canal declara los providers que necesita, se suscribe, y recibe eventos por
`processProviderEvent`. Lo que falta no es el mecanismo: es que un **plugin** pueda ponerse del lado
del productor.

## 2. Objetivo

**Que un plugin pueda exponer la información que ya produce también in-process, para que otros
plugins se suscriban a ella, sin dejar de ser un solo plugin.**

A eso lo llamamos **pluvider**: un plugin que además se comporta como provider.

### No objetivos

- **No** es empaquetar dos extensiones juntas. Es **un plugin, un back, una instancia, una
  información** — expuesta por varias puertas (D1).
- **No** sustituye a los providers. Un provider sigue siendo lo adecuado cuando la información no es
  de nadie en particular (eventos del cluster, métricas, un CRD).
- **No** es un canal de comunicación entre fronts. Es back a back, dentro del mismo Kwirth.

## 3. Concepto

La información de un plugin ya sale hoy por al menos una puerta: su front. El pluvider **añade una
puerta más en el mismo punto de emisión**, no un pipeline nuevo.

El caso de Agora lo enseña literalmente: ya tiene un fan-out de alertas con lista de suscriptores
(`alertSubscribers`, `pushAlertToSubscribers`) construido para **federación** — que otro cluster se
suscriba a sus alertas autónomas por websocket. El pluvider es **una segunda lista de destinatarios
en ese mismo punto**: canales in-process en lugar de sockets (F8).

```
                      +--------------------------------+
     alerta           |  punto de emisión del plugin   |
     producida  ----> |  (ya existe)                   |
                      +----+---------+---------+-------+
                           |         |         |
                 su front -+         |         +- OTROS PLUGINS   <- lo nuevo
                                     |             (in-process)
                          federación-+
                          (websocket)
```

## 4. Casos de uso

| # | Productor | Qué expone | Consumidor típico |
|---|---|---|---|
| CU1 | Agora | Alertas proactivas (métricas anómalas, crashes) | Cualquier plugin que quiera reaccionar a un incidente |
| CU2 | Censor | Mensajes de log ya filtrados | Un plugin que quiera actuar sobre lo filtrado sin refiltrar |
| CU3 | Montag | Lo mismo, con su propio criterio | Ídem |
| CU4 | Situs | Información elaborada de una IP, **bajo petición** | Fase 2 — es *pull*, no *push* (ver §9) |

CU1–CU3 son **push**: el productor empuja cuando tiene algo. Ese es el MVP (D6).

## 5. Requisitos funcionales

- **RF1 — Un plugin puede declararse pluvider.** Sobre su propia clase y su propia instancia, sin
  segunda clase, segundo dist ni segunda entrada de manifest (D1).
- **RF2 — Un consumidor se suscribe igual que a un provider.** `clusterInfo.addSubscriber(id, this,
  data)` y recibe por `processProviderEvent`. **Cero API nueva para el consumidor**: ambos métodos ya
  existen en el contrato (F9).
- **RF3 — El identificador lleva prefijo**: `plugin:<nombre>` (D13). Se usa igual en
  `requirements.providers` y en `addSubscriber`.
- **RF4 — La dependencia es blanda** (D10). Si el productor no está instalado o no está corriendo, el
  consumidor **arranca igual** y funciona sin él. Nunca es un error fatal.
  **No es comportamiento nuevo: es exactamente lo que ya ocurre hoy con los providers.** Verificado en
  dos sitios, y en los dos se avisa y se sigue, sin abortar nada:
  - el core, al resolver `requirements.providers`, loguea `Required provider '<id>' is not registered`
    y continúa instanciando y arrancando el canal ([back/src/index.ts:1755-1758](../../back/src/index.ts#L1755-L1758));
  - `ClusterInfo.addSubscriber`, si no encuentra el id en `clusterInfo.providers`, loguea
    `Cannot subscribe channel '<canal>' to provider '<id>' (provider do not exist)` y vuelve
    ([back/src/model/ClusterInfo.ts:61-69](../../back/src/model/ClusterInfo.ts#L61-L69)).

  RF4 se limita, por tanto, a **declararlo intencional** para pluviders en vez de dejarlo como efecto
  colateral. **Matiz**: hoy los dos avisos son `logError`. Para un pluvider, que el productor no esté
  es un escenario **legítimo** —puede no estar adquirido (§7)—, no un fallo: ahí el nivel correcto es
  *warning*. Se ajusta **solo para pluviders**; con un provider declarado en `requirements` la
  ausencia sigue siendo una mala configuración y mantiene su `logError`.
- **RF5 — El filtro de suscripción y el formato del evento los define cada pluvider** (D12), como ya
  hacen todos los providers, que no comparten ningún contrato de forma (F12).
- **RF6 — Un pluvider debe publicar `getSubscriptionHelp()`.** Es el único contrato común que existe
  para explicar a un consumidor qué escribir, y en un pluvider el consumidor es **otro equipo**. Hoy
  solo lo implementan 5 de los providers existentes; en pluviders se exige.
- **RF7 — Orden de arranque: providers → pluviders → plugins** (D3). Tres fases fijas, sin grafo de
  dependencias ni detección de ciclos.
- **RF8 — Coincidencia de nombre: se avisa, no se bloquea** (D14). Si conviven un provider `XX` y un
  plugin `XX` con pluvider no hay ambigüedad técnica (namespaces distintos, §RF3), pero sí confusión
  humana. Se avisa en **tres momentos**, y la coincidencia se detecta **en las dos direcciones**,
  porque cualquiera de las dos extensiones puede llegar la segunda:
  1. al instalar un **plugin con pluvider** cuyo nombre coincide con el de un **provider ya
     instalado**;
  2. al instalar un **provider** cuyo nombre coincide con el de un **plugin con pluvider ya
     instalado**;
  3. en el **arranque del core**, una vez por cada coincidencia viva.

  La instalación **nunca se rechaza**: el aviso informa, no bloquea.
- **RF9 — Descubribilidad.** Un pluvider activo debe ser visible como productor donde ya se ven los
  providers (gestor de extensiones y `provider-debug`), distinguible de un provider instalado y
  marcado como no desinstalable por separado: se va con su plugin.

## 6. Qué implica en el core

Muy poco, y ese es el argumento principal a favor de este diseño (F10):

1. Registrar la instancia del canal-pluvider en `clusterInfo.providers` bajo su id `plugin:<nombre>`.
   A partir de ahí, la resolución existente por id ya hace el resto.
2. Aplicar el orden de arranque de RF7.
3. Los avisos de RF8 y la visibilidad de RF9.

No hace falta contrato nuevo para el consumidor, ni un transporte nuevo, ni tocar `processCommand`.

## 7. Modelo de producto

Un pluvider es **completamente de pago o completamente público** (D11). No existe declaración de "a
qué consumidores expongo": quien ha adquirido la extensión productora puede exponer toda la
información que quiera — para eso la ha adquirido. La barrera es la extensión productora en sí, no
una lista de consumidores.

## 8. Limitaciones conocidas

- **Un plugin `SINGLE` solo tiene pluvider donde está hospedado.** Agora declara `instances: SINGLE`:
  en desktop/docker se anuncia REMOTE y no se instancia localmente, luego ahí **no hay pluvider al
  que suscribirse** (F11). La puerta in-process existe donde el plugin corre de verdad; para el resto
  ya está la federación. RF4 (dependencia blanda) es lo que hace que esto degrade con dignidad en vez
  de romper.
- **Es in-process**: mismo Kwirth. No cruza clusters.

## 9. Fuera de alcance del MVP

- **Cara de consulta (*pull*)** — que un consumidor **pregunte** (`ask(command, data)`) en vez de
  estar suscrito. Es el caso de Situs (CU4). Va a fase 2 (D6).
- **Separar la publicación en `publications[]`** — array con `kind` (CHANNEL / PROVIDER / CONFIG),
  router y alias, en vez de las cuatro propiedades planas de hoy (D2). Sigue siendo buena decisión,
  pero la colisión de routers que resuelve **solo aparece si un pluvider quiere publicar router
  propio**, y empujando eventos no hace falta ninguno (D7).
- **Descubrimiento en runtime** de qué pluviders hay disponibles, para no llevar el id escrito en el
  código (Q9, abierto).

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| El pluvider debe producir **antes** de `startChannel()`, porque arranca en la fase anterior (RF7) | Documentarlo como requisito del autor: el trabajo de fondo vive en el lado provider, el front se engancha después |
| Un consumidor acoplado al formato de un productor que cambia | RF6: el formato es parte del contrato publicado del pluvider, versionado con él |
| Confusión provider `XX` / plugin `XX` | RF8: aviso al instalar y al arrancar |
| Cadena de productores (un pluvider consumiendo de otro) | RF7 los arranca a todos en la misma fase; la dependencia blanda (RF4) evita el bloqueo, pero el orden **dentro** de la fase no está garantizado — a decidir en el PLAN |

## 11. Criterios de aceptación

1. Un plugin consumidor declara `requirements.providers: ['plugin:agora']`, se suscribe y **recibe
   una alerta real** producida por Agora, sin que Agora publique ningún endpoint nuevo.
2. Con el productor **no instalado**, el consumidor arranca, funciona y lo deja dicho en el log. Sin
   errores fatales.
3. Con un provider `XX` y un plugin `XX` instalados a la vez, ambos son direccionables sin ambigüedad
   (`XX` y `plugin:XX`), y el core avisa de la coincidencia en los **tres** momentos de RF8, **sea
   cual sea el orden** en que se instalaron los dos.
4. El pluvider aparece en el gestor de extensiones y en `provider-debug` como productor, marcado como
   perteneciente a su plugin.
5. `getSubscriptionHelp()` del pluvider permite a `provider-debug` explicar la suscripción sin mirar
   el código.
