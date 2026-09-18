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

### S1.1 — Contrato en `common-back`

- Declaración explícita del plugin como pluvider (nada de duck-typing sobre `addSubscriber`), con el
  subconjunto push de `IProvider` que debe implementar: `addSubscriber`, `removeSubscriber`,
  `startProvider`, `stopProvider`, `getSubscriptionHelp` (obligatorio por RF6).
- **Tipos nuevos a validar contigo antes de escribirlos** (regla del proyecto). Van a
  `common-back/src/` junto a `IProvider.ts`, y el enum que salga, a `common`.
- El `id` **no lo escribe el autor**: lo compone el core como `plugin:<channelId>`, para que nadie se
  equivoque con el prefijo (RF3).

**Checks**: `tsc --noEmit` limpio en `common-back`; el contrato compila desde un plugin de ejemplo.

### S1.2 — Registro y resolución

- Registro de pluviders poblado tras instanciar los canales.
- `ClusterInfo.addSubscriber` resuelve `plugin:<x>` contra ese registro
  ([ClusterInfo.ts:61-69](../../back/src/model/ClusterInfo.ts#L61-L69)); el camino de providers queda
  **igual que hoy**.
- `removeSubscriber` / `updateSubscriber` por el mismo camino.

**Checks**: tests de back para los cuatro casos — pluvider existe / no existe / provider existe /
provider no existe. Verificar que el camino de providers no cambia de comportamiento.

### S1.3 — Orden de arranque (RF7)

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

### S1.4 — Dependencia blanda (RF4 / D15)

- Productor ausente → el consumidor arranca y funciona.
- Nivel **warning** cuando el que falta es un pluvider; `logError` intacto cuando es un provider
  declarado en `requirements`.

**Checks**: test con productor ausente — el canal arranca, no lanza, y el aviso sale con el nivel
correcto.

---

## F2 — Agora, primer productor

**MVP de la fase**: una alerta proactiva real de Agora llega a otro plugin in-process.

### S2.1 — Agora se declara pluvider y engancha su fan-out

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

### S3.1 — Avisos de coincidencia (RF8 / D16)

Tres momentos, **dos direcciones**:

1. al instalar un plugin con pluvider que choca con un provider ya instalado
   ([PluginManager](../../back/src/tools/PluginManager.ts));
2. al instalar un provider que choca con un plugin con pluvider ya instalado
   ([ProviderManager](../../back/src/tools/ProviderManager.ts));
3. en el arranque del core, uno por coincidencia viva.

**Nunca se rechaza la instalación.**

**Checks**: criterio de aceptación 3 — instalar en los **dos** órdenes posibles y ver el aviso en
ambos, con las dos extensiones direccionables (`XX` y `plugin:XX`).

### S3.2 — Visibilidad (RF9)

- El pluvider aparece como productor en el gestor de extensiones y en `provider-debug`, distinguible
  de un provider instalado y marcado como **no desinstalable por separado** (se va con su plugin).
- ⚠️ El gestor de extensiones son **once** vistas (instalados/disponibles × tarjeta/lista): auditar
  por script **antes** de tocar nada, según el criterio de
  [plans/extension-managers-ui/PLAN.md](../extension-managers-ui/PLAN.md).
- `provider-debug` debe poder explicar la suscripción a partir de `getSubscriptionHelp()` sin mirar
  código (criterio de aceptación 5).

**Checks**: e2e sobre `provider-debug` y sobre el gestor; criterios de aceptación 4 y 5.

---

## F4 — Censor y Montag como productores

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
  documentación del core (`docs/<version>/guide/`), y editar el markdown **no basta**: hay que
  regenerar el tgz con `build-docs-tgz.js` y reiniciar el back, o se sigue sirviendo la vieja.
- Mis trazas de depuración se retiran al terminar el PLAN completo, no al cerrar cada stream.
