# Kwirth Status — Plan

> **ESTADO — VIVO** (2026-09-24). **S1 y S2 entregados**; quedan S3 y S4. Cuelga de [PRD.md](PRD.md), que manda en el
> **qué** y el **por qué**; aquí está el **cómo** y en qué orden.
>
> Documento **append-only**: lo que se decide no se borra, se marca. Si algo de aquí contradice lo que ves
> en el producto, gana el producto.

## Lo que ya existe y no hay que construir

Conviene tenerlo delante antes de planificar, porque recorta bastante el trabajo:

| pieza | dónde | qué aporta |
|---|---|---|
| Topología en vivo | `ClusterInfo.providers`, `.pluviders`, `.senders`, `.webhooks`, `.nodes` | el inventario **ya está en memoria**, y los plugins reciben `clusterInfo` |
| Estado de arranque | `IProvider.started`, `.configRouterStarted` | parte del "¿está levantado?" |
| React Flow 12 | `window.__kwirth__.reactFlow` | el diagrama, sin bundle propio |
| Layout automático | `window.__kwirth__.loadElk()` | elkjs con carga diferida (~1,4 MB en su propio chunk) |
| Scopes RBAC por plugin | el mecanismo que ya usan los demás | RF5 sin inventar nada |

**Lo único que falta en el core** es poder preguntarle a un provider a quién tiene dentro: hoy cada uno
guarda sus suscriptores en un `Map` privado y `IProvider` no expone forma de consultarlo.

## Decisiones de arquitectura

1. **El plugin no recolecta: consulta.** No hay temporizador en el back. Cuando el front pide, el back mira
   `ClusterInfo` y pregunta a quien sepa responder. Con el canal cerrado, el coste es cero. Esto no es una
   optimización, es el RNF1 del PRD y condiciona todo lo demás.
2. **El contrato nuevo va al core, que es público.** `getStats()` **opcional** en `IProvider`, con el patrón
   ya estrenado en `IExtension`: quien no lo implemente sale como "no informa" y la adopción es incremental,
   sin bump masivo. Si el contrato acabara en el lado privado, ningún provider público lo implementaría.
3. **Todo lo que se muestre lleva sitio para un cluster.** No se implementa la federación, pero los tipos no
   pueden cerrarse a un solo Kwirth, o el día que llegue habrá que rehacer el front entero.
4. **El front no pinta lo que no sabe.** "No informa" es un estado de primera clase, distinto de cero y de
   error (RNF2).
5. **La instrumentación va atada al ciclo de vida del canal, y no hay interruptor.** Se enciende cuando el
   primer usuario abre la pantalla y se apaga cuando el último la cierra (cuenta de referencias). Encender
   **sustituye la implementación**, no activa una bandera: así el camino apagado no ejecuta ni un `if` de
   más. Mientras alguien mira, el coste no preocupa — es su consulta y la paga él.

## Streams

Cada stream entrega algo que se puede abrir y usar, y **cierra su propia CL9**.

---

### S1 — El plugin existe y enseña el inventario ✅ HECHO (2026-09-24)

**Entregable:** se instala `status`, se abre su pestaña y lista **todo lo que Kwirth tiene montado** con su
estado real. Sin diagrama y sin contadores todavía: ya responde *"¿está todo levantado?"*, que es la
pregunta que más veces se hace.

**Alcance**

- Plugin nuevo en `plugins/status/`, id `status`, canal de solo lectura.
- Inventario leído de `ClusterInfo`: providers, pluviders, senders, webhooks y canales.
- Los estados del RF1 que **se pueden saber sin tocar el core**, con su porqué: instanciado / no
  instanciado / pendiente de reinicio, derivados de `started`, `configRouterStarted` y del meta de la
  extensión.

  ⚠️ **Corregido al empezar (2026-09-24):** distinguir **activo** de **ocioso** exige saber si alguien
  consume, y eso es justo lo que hoy no se puede preguntar — pasa a S2, con el contrato. En S1 los dos
  casos se muestran juntos como "instanciado", sin fingir que se sabe más.
- Scopes RBAC propios (RF5), publicados en runtime. La vista no es para cualquiera.
- Vista de lista, ordenable y filtrable. Nada de grafo aún.

**Checks**

- [ ] Con la pestaña cerrada no se ejecuta **nada**: ni temporizadores, ni suscripciones, ni peticiones.
- [ ] Un provider instalado y nunca instanciado aparece, y **dice por qué** no lo está.
- [ ] Nada se presenta como "ocioso" o "activo" en este stream: ese dato no existe todavía y no se inventa.
- [ ] Sin el scope, la pestaña no aparece.
- [ ] Un provider que falla al responder no tumba la vista: sale como "no informa".

**Riesgos**

- Distinguir "no instanciado" de "caído" puede no ser posible con lo que hoy guarda el core. Si falta el
  dato, **se dice que falta**, no se adivina: inventar un estado es peor que no darlo.

**Cómo quedó**

Plugin en `plugins/status/`, 12 tests de harness y 9 casos e2e, todo en verde. `FAILED` quedó declarado en
el enum pero **sin emisor**: el core no guarda hoy el error de un provider que falló al arrancar, así que
nadie lo produce todavía. Se deja el estado definido —el día que el core lo sepa, el front ya lo pinta— y no
se finge que se detecta.

Tres tropiezos que conviene no repetir en S2–S4:

1. **El icono no puede salir del barrel de `common-front`** salvo que ya esté ahí: `MonitorHeartOutlined` no
   estaba y llegaba `undefined`, lo que revienta el render entero. Acabó siendo un **SVG propio** en
   `src/front/icons.tsx` (decisión del usuario: el barrel es para los comunes), con los atributos de trazo
   en un `<g>` — puestos en el `<SvgIcon>`, el CSS de MUI los rellena.
2. **`channelObject.data` lo crea el canal** en `initChannel`; el core no lo inventa.
3. **El contenedor de una pestaña no tiene altura**, así que `height: 100%` no resuelve y la tabla se sale
   de la pantalla sin barra de scroll. Hay que medir dónde empieza la caja y darle el resto del viewport,
   como hacen los demás canales. Lo cazó el QA, no los tests: ahora hay un caso e2e que lo fija.

El `ChannelErrorBoundary` del core hizo su trabajo en los dos primeros: la pestaña enseñó el fallo con su
mensaje y el resto de Kwirth siguió funcionando.

---

### S2 — El contrato: quién consume qué ✅ HECHO (2026-09-24)

**Entregable:** el inventario gana la columna que hoy nadie puede dar — *"¿esto lo usa alguien?"*.

**Alcance**

- `getStats?()` opcional en `IProvider` (core, público). Devuelve lo que el provider ya tiene: número de
  suscriptores y quiénes son. **Barato por contrato**: devuelve, no calcula.
- Lo implementan los providers open source del repositorio.
- El plugin lo consume y lo pinta, tolerando a quien no lo implemente.
- Documentar el contrato para quien escriba providers de terceros.

**Checks**

- [ ] Un provider sin `getStats` sale como "no informa", no como "0 suscriptores".
- [ ] Con el contrato ya disponible, "instanciado" se parte en **activo** (tiene consumidores) y **ocioso**
      (no tiene), que es lo que S1 no podía distinguir.
- [ ] Los números cuadran con la realidad: abrir un canal que consume ese provider sube el contador.
- [ ] Publicar el contrato no rompe ningún provider ya instalado (es opcional).

**Riesgos**

- ⚠️ Tocar `IProvider` arrastra publicación de `kwirth-common-back` y **cascade** a los dependientes. Hay
  que planificarlo: publicar, esperar a poder instalar, y **entonces** tocar el core — la lección que ya
  costó un back sin compilar.

**Cómo quedó**

`getStats?(): IProviderStats` en `kwirth-common-back@0.5.50`, y **los 16 providers cableados**: los 2 del
core y los 14 del repo. El plugin parte *Running* en **Active** / **Idle** y añade la columna *Consumers*.
17 tests de harness y 10 casos e2e.

**El cascade no hizo falta.** El método se implementa **sin anotar el tipo de retorno**, así que se cumple
por estructura y ni el core ni catorce paquetes tienen que subir la dependencia ni esperar a que npm
propague. Es la diferencia entre un cambio de contrato que se puede adoptar en una tarde y uno que
bloquea a todo el mundo — conviene recordarlo para el próximo.

⚠️ **Aun así costó un back sin compilar:** anoté `(): IProviderStats` en los providers del core y el tipo
todavía no estaba en su `node_modules`. Es exactamente la lección del riesgo de arriba, cometida otra vez
por escribir la anotación antes de tiempo.

**Una validación bonita del diseño:** `service-flow` ya tenía un `getStats()` con ese nombre y un campo
`subscribers`, escrito antes y sin coordinación. Encaja con el contrato sin tocarlo, y no hubo que
republicarlo.

**Lo que se protege con test, en los dos lados:** `undefined` **no es 0**. Un provider que no informa sale
con un guion, y hay casos para el que no lo implementa, el que **revienta** al preguntarle —es código de
terceros: se degrada a "no informa"— y el que devuelve **basura**. Más uno de orden: un provider **parado**
no se marca ocioso aunque diga cero, porque *no arrancado* es la causa y *sin consumidores* el efecto.

🔴 **Un defecto propio que cazó el propio stream:** el array que ordenaba la tabla por urgencia no conocía
los estados nuevos, así que `indexOf` devolvía **-1** y los habría puesto **encima de los fallos**. Ahora
es un `Record`, y TypeScript obliga a decidir el sitio de cualquier estado que se añada.

**Lo que NO se pudo hacer, y por qué:** el diagrama de S3 necesita saber **quién** consume, no solo cuántos.
`IProviderSubscriber` es una interfaz de un solo método y **no lleva identidad**, así que un provider no
tiene con qué identificar a los suyos. S3 tendrá que ampliar ese contrato, y es una decisión aparte.

---

### S3 — El diagrama

**Entregable:** el mapa visual del streaming, del mismo tipo que los de Iter.

**Alcance**

- React Flow desde el global del core; `build.mjs` con el mismo mapeo que usa Iter → **0 KB de bundle**.
- Layout automático con `loadElk()`, cargado la primera vez que se dibuja.
- Nodos por componente con su estado en el color y la forma; aristas producto→consumidor.
- ⚠️ **Bloqueante descubierto en S2:** para dibujar una arista hace falta saber **quién** consume, y
  `getStats()` solo da **cuántos**. `IProviderSubscriber` no lleva identidad —es una interfaz de un solo
  método—, así que S3 empieza por decidir cómo identificar a un suscriptor sin romper a los providers ya
  publicados.
- Navegable en los dos sentidos: *"¿de qué depende esto?"* y *"¿a quién afecta si lo quito?"*.
- Refresco **solo con la pestaña abierta y visible**.

**Checks**

- [ ] El bundle del plugin no crece con React Flow (verificar el tamaño del `dist`).
- [ ] elkjs no se descarga hasta abrir el diagrama.
- [ ] Un Kwirth con una sola extensión se ve bien, y uno con veinte también.
- [ ] Un componente huérfano (sin consumidores) se distingue a simple vista.
- [ ] Con la pestaña en segundo plano, el repintado se para.

---

### S4 — Contadores por componente

**Entregable:** cuánto caudal mueve cada cosa mientras la miras, y la prueba de que con la pantalla cerrada
Kwirth corre exactamente igual que sin este plugin.

**Alcance**

- Contadores enteros en el camino caliente: eventos, bytes, errores. **Cero asignaciones por evento.**
- **Encendido y apagado por el ciclo de vida del canal**, con cuenta de referencias: el primero que abre
  enciende, el último que cierra apaga. Sin ajuste, sin interruptor en la UI.
- Encender **sustituye la implementación** (una vez), no consulta una bandera por evento.
- Acumulados; las tasas las calcula el front restando muestras. La UI deja claro que la cuenta empieza al
  abrir, no al arrancar Kwirth.

**Checks**

- [ ] 🔴 Con el canal cerrado, el camino caliente ejecuta **lo mismo** que sin el plugin instalado, y el
      plugin no retiene un solo byte.
- [ ] Encender y apagar cien veces no deja instrumentación colgada ni contadores duplicados.
- [ ] Con dos usuarios mirando, cerrar uno **no** apaga los contadores del otro.
- [ ] Con el canal abierto, ninguna estructura crece con el número de eventos (sí con el de componentes).
- [ ] La pantalla dice que la cuenta empieza al abrir; nadie puede confundir eso con un histórico.

**Riesgos**

- Sustituir un método en caliente puede desoptimizar ese punto de llamada en V8 justo al hacerlo. Ocurre
  **una vez al encender**, no por evento, y luego se reestabiliza: es un coste puntual a cambio de cero coste
  permanente. Conviene comprobar que efectivamente se reestabiliza y no queda megamórfico.

---

## Lo que este plan NO hace

- **Avisos por sender.** Aplazado en el PRD: exigiría vigilar siempre y esto es para echar un ojo.
- **Serie temporal ni historia.** Se enseña el ahora.
- **CPU o memoria por componente.** Fuera por coste y por honestidad del dato (RF3).
- **Federación multicluster.** Otra versión, y el diseño solo debe dejarla posible.

## Registro de decisiones

| fecha | decisión |
|---|---|
| 2026-09-24 | Nace el PRD. Mono-cluster, público OSS, id `status`. |
| 2026-09-24 | Avisos (RF4) fuera: *"esto es solo para echar un ojo, no es para monitorizar kwirth en profundidad"*. |
| 2026-09-24 | RF3 limitado a contadores baratos; sin memoria atribuida. |
| 2026-09-24 | Diagrama con React Flow + elk desde los globales del core, como Iter. |
| 2026-09-24 | S1 entregado. Icono: **SVG propio del plugin**, no del barrel — el barrel es para los iconos comunes. |
| 2026-09-24 | S2 entregado. El método va **sin anotar el tipo**: se cumple por estructura y evita el cascade en 14 paquetes. |
| 2026-09-24 | Privados publicados con el cableado: azure 0.2.1, fluentbit 0.1.2, longhorn 0.2.2, sugarless 0.2.4. Los 9 públicos quedan **construidos pero sin publicar**. |
| 2026-09-24 | Rendimiento: el requisito es **coste cero con el canal cerrado**; con alguien mirando no preocupa. Se cae el techo del 5 % (el ruido de medida en Node es mayor) y se cae el interruptor: lo enciende el ciclo de vida del canal. |
