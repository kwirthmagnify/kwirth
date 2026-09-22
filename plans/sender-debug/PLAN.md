# Sender Debug — plan

> **ESTADO — VIVO** (2026-09-22). **S1 entregado y validado** (`plugin/sender-debug@0.1.0`): el plugin
> está operativo. Queda **S2** (pulido y publicación de lo que falte).
> Cuelga del [PRD](./PRD.md). Registro de **por qué** se hace así, no de cómo funciona hoy: para eso
> manda el código y el README. Si algo de aquí contradice lo que ves en el producto, gana el
> producto. El plan no se borra — es append-only —, se marca.

Plugin de canal para probar senders a mano: elegir uno, elegir una de sus configuraciones, componer
un mensaje y ver qué contestó. Público, open source, `plugins/sender-debug`, id `sender-debug`.

## Decisiones cerradas

- **D1 — Es un plugin de canal**, no un sender ni un provider. Vive en `plugins/`, y no declara
  `requirements.providers`: un depurador no debe arrancar nada por estar instalado (misma decisión
  que provider-debug).

- **D2 — El back llama al sender DIRECTAMENTE, vía `clusterInfo.senders`**, no por
  `backChannelObject.senders`.

  El motivo es el que justifica el plugin entero: `SenderManager.send()`
  ([back/src/tools/SenderManager.ts:563](../../back/src/tools/SenderManager.ts#L563)) captura la
  excepción del sender, hace `logError` y devuelve `undefined`. Y `undefined` es *también* lo que
  devuelve un envío correcto de un sender de notificación pura. Por la vía oficial, **un
  depurador no puede distinguir entregado de reventó**, que es justo lo único que se viene a ver.

  Con `clusterInfo.senders` (el `SenderManager` en crudo, que el core publica en
  [back/src/index.ts:2073](../../back/src/index.ts#L2073)) se obtiene el `ISender` real y se llama a
  su `send()` capturando aquí la excepción. De paso da lo que la vía oficial no expone:
  `senderType`, `getConfigSchema()` y el `sendBatch()` de verdad.

  Precedente exacto: provider-debug lee `clusterInfo.providers` y `clusterInfo.pluviders` igual.
  `clusterInfo` llega como `any`, así que se tipa **localmente** con una interfaz mínima — lo que
  este canal necesita del manager y nada más.

  Degradación: si `clusterInfo.senders` no estuviera, se usa `backChannelObject.senders` y se avisa
  en pantalla de que los errores no se podrán detallar. Que el depurador no funcione es peor que
  que funcione a medias.

- **D3 — El catálogo sale de `GET /core/senders`**, no de `listSenders()`.

  `ISenderAccess.listSenders()` recorre `this.instances`: solo los senders **ya instanciados**.
  `getSender()` es perezoso ([SenderManager.ts:463](../../back/src/tools/SenderManager.ts#L463)),
  así que un sender instalado y configurado al que nadie ha enviado todavía **no aparece** — que es
  el caso normal de quien acaba de configurarlo y quiere probarlo. El endpoint
  ([back/src/api/SenderApi.ts:21](../../back/src/api/SenderApi.ts#L21)) devuelve los instalados con
  `displayName`, `version` y `configNames`, y está disponible sin arrancar el canal.

  `listSenders()` se sigue usando, pero solo para **marcar** quién está ya vivo, igual que
  provider-debug marca `not running`. Aquí la marca no impide enviar: enviar es precisamente lo que
  lo instancia.

- **D4 — El mensaje se compone en la PESTAÑA, no en el setup.** Es un banco de pruebas: se envía,
  se mira, se corrige y se vuelve a enviar. Meterlo en el setup obligaría a parar y rearrancar la
  instancia por cada cambio de texto. El setup queda con lo que sí es configuración del canal
  (tamaño del historial).

- **D5 — `send` y `sendBatch` en el MVP; `fetchStatus` y los filtros, no.** `sendBatch` entra porque
  es la ruta que hoy **no tiene ninguna forma de ejercitarse a mano** y la que usan los destinos de
  log. `fetchStatus` y `evalFilter` quedan en el backlog: cada uno pide su propia pantalla.

- **D6 — Un envío es un envío REAL, y se dice.** No hay modo simulacro: un simulacro no probaría
  nada. La pantalla avisa, y el envío siempre es una pulsación explícita.

- **D7 — Los e2e no pulsan SEND contra nada que salga a la red.** Regla del proyecto: un e2e que
  dispare un sender manda avisos reales a personas reales. Los e2e cubren catálogo, formulario,
  validaciones y estados; el único envío permitido es contra el sender `console`, que solo escribe
  en el log del core (y es justo el que trae el entorno dev, con la config `dev-console`).

## S1 — el plugin funcionando · HECHO (v0.1.0, 2026-09-22)

Entrega un plugin **usable**: se instala, se abre la pestaña, se elige sender y config, se envía y
se ve el resultado.

1. Esqueleto: `package.json`, `build.mjs`, `watch.mjs`, `tsconfig.json`, `.gitignore`, README.
2. `src/common/SenderDebugTypes.ts`: enums de comando y de payload, tipos de catálogo, de petición
   y de resultado de envío. Enums en `common`, nunca uniones de strings (regla del proyecto).
3. `src/back/index.ts`: canal cluster-scoped. Comandos `LIST`, `SEND`, `SENDBATCH`; catálogo al
   arrancar la instancia; captura de excepción y de resultado; `accessKey` validada por el core.
4. `src/front/`: canal, config/instanceConfig/data, setup mínimo y `TabContent` con los dos
   desplegables, el formulario del mensaje, el botón SEND y el historial.
5. Registro en `back/kwirth-dev.json` (`plugins`), para poder probarlo en el dev.
6. 42 tests unit + 12 casos e2e, con el histórico de métricas y sus dos PNG.
7. CL9 completa.

### Lo que cambió al implementarlo

- **D3 se cumple, pero por otra puerta.** El catálogo no lo pide el front a `GET /core/senders`: lo
  arma el **back del canal** y lo manda por el websocket. Es la misma fuente —`listInstalled()` es
  justo lo que sirve ese endpoint— y ahorra un fetch con su token desde el front. Se puede porque
  la selección se hace en la pestaña (D4), que solo existe con el canal arrancado; el setup, que se
  abre antes, no necesita el catálogo para nada.

- 🐛 **Hallazgo del CORE, cazado por el e2e:** `SenderManager.listInstalled()`
  ([back/src/tools/SenderManager.ts:427](../../back/src/tools/SenderManager.ts#L427)) concatena el
  índice de instalados con los senders de **dev** y **no deduplica por id**. En un entorno de
  desarrollo el mismo sender llega dos veces, y eso lo sirve también `GET /core/senders` a
  **cualquier** consumidor — el gestor de senders del front incluido. Aquí se deduplica en el
  plugin, conservando la entrada de dev (la que el core acaba resolviendo por `getSender()`). **El
  arreglo en el core no se ha hecho**: ver backlog.

- **D8 (nueva, del QA) — toda fila del historial se despliega, y enseña la PETICIÓN además de la
  respuesta.** La primera versión solo abría las filas con algo que enseñar, y como la mayoría de
  senders son de notificación pura —devuelven `void`— el desplegable quedaba apagado justo en el
  caso más común. Ahora la fila abre siempre y muestra `Sent` (el `ISenderMessage` tal cual salió) y
  `Answered`. Consecuencia de diseño: la **petición vive en el historial del front**, porque no
  vuelve del back — la compuso el front, y es el único sitio donde las dos mitades pueden estar
  juntas.

- **La fila se crea al ENVIAR, no al contestar.** Con un destino lento, ver `sending…` es la
  diferencia entre ver algo y no ver nada. Si el canal se para con un envío en vuelo, la fila lo
  dice (`no answer — the channel was stopped`) en vez de quedarse enviando para siempre: no se
  inventa un resultado que nadie ha dado.

## S2 — pulido · PENDIENTE

Lo que se planeó aquí y **ya salió en S1**: la validación del JSON antes de habilitar SEND, el
README completo, y el `bbpm` con su entrada en `plugins/manifest.json` (el plugin estaba operativo
al cerrar S1, así que publicarlo entonces era lo honesto).

Queda:

1. Volcado JSON **coloreado** en la fila desplegada (reutilizar el `JsonBlock` de provider-debug, que
   ya colorea por tipo con la paleta MUI). Hoy es un `<pre>` monoespaciado.
2. Esquema de la configuración elegida a la vista (`getConfigSchema()`), para saber qué espera ese
   sender sin salir de la pestaña.
3. Editor propio para `origin` (hoy solo se estampa `source` y `timestamp`; un sender que etiqueta
   por `cluster`/`namespace`/`pod` no se puede probar del todo).
4. **CL9 completa** al terminar el stream.

## Backlog

*(vacío por ahora)*

## El duplicado del core · ARREGLADO (2026-09-22)

El hallazgo que salió de este plugin no se quedó en el plugin.

`listInstalled()` concatenaba el índice de instalados con los metadatos de dev **sin filtrar los que
se pisan**, y una extensión registrada en `kwirth-dev.json` **sustituye** a la instalada con su mismo
id: no se suma a ella. En un entorno de desarrollo —donde lo normal es tenerla instalada *y* además
montada desde su `dist`— la misma salía dos veces, y el duplicado viajaba tal cual por
`/core/senders`, `/core/providers` y `/core/webhooks` a todos sus consumidores.

Al ir a arreglarlo apareció que **no era solo de senders**: `plugin`, `theme`, `login`, `homepage` y
`aitoolset` ya llevaban el filtro, pero **sender, provider y webhook se habían quedado atrás**. Los
tres usan ahora el mismo patrón, con 8 tests nuevos (que montan un workspace de dev de verdad y
recorren el camino del arranque, en vez de falsear los mapas a mano) y un caso e2e en el gestor de
senders.

La deduplicación **del plugin se queda**: no sobra. Sigue defendiéndolo de un core anterior al
arreglo, que es exactamente el caso que un depurador se va a encontrar por ahí.

- `fetchStatus(configName, externalId)`: reconciliar el estado de un ticket creado por un sender de
  ticketing. Pide su propia pantalla (pedir un id externo no es componer un mensaje).
- Senders de tipo `filter` (regex, ratelimit, timed) y `evalFilter()`: un filtro no entrega, encadena.
  Hoy se listan y se marcan, pero enviarles algo no prueba lo que parece.
- Repetir un envío del historial con un clic.
- Plantillas de mensaje guardadas (storage del canal).
- Exportar el historial.
