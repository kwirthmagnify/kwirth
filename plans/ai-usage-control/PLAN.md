# Control de uso de los servicios de IA — PLAN

> **Estado: S1 ENTREGADO el 2026-10-06**, QA validado (A y B). Queda **S2**, el tope por canal.
> PRD: [PRD.md](PRD.md).
>
> **2026-10-26 — cambio de especificación sobre S1** (`kwirth-common-ai@0.5.76`), QA validado: los precios
> y los límites se editan en **todos** los modelos, con los del provider como valor por defecto. Ver
> [Cambio de especificación](#cambio-de-especificación-2026-10-26--precios-y-límites-por-modelo).

## Dos streams, cada uno un MVP

El reparto no es «motor primero, UI después»: un tope que no se puede configurar no lo puede probar nadie,
y un stream que no se puede validar no cierra su CL9. Así que cada stream entrega **un tope que funciona de
punta a punta**, y el segundo añade el eje que cuesta ocho artefactos.

---

## S1 · El motor y el tope por clave de LLM — ✅ ENTREGADO (2026-10-06)

Entrega: un administrador pone un tope a una **clave**, por llamadas, tokens o **coste**, diario o
mensual, y Kwirth corta cuando se alcanza. QA validado en sus dos partes: configuración y corte.

`@kwirthmagnify/kwirth-common-ai` publicada en **0.5.66** y la dependencia subida en back, front y agora.
**641 tests en el core** (639 ✅ / 2 ⏭) y **49** en common-ai.

**Por qué este eje primero**: es el que no necesita que ningún plugin cambie. `buildModel()` ya recibe el
`ILlm` y los providers, así que puede anotar lo que devuelve y el envoltorio consultarlo. Todo vive dentro
de `common-ai` y del core.

### Qué se construye

1. **El servicio de uso, en el core.** Tabla única vía `common-sql` (`ensureDb`), con el esquema del PRD y
   `UPSERT … ON CONFLICT DO UPDATE` para que el incremento sea atómico. Sin SQL, el mismo contrato contra
   un contador en memoria, y **aviso en el arranque** de que es volátil.
2. **El envoltorio de `generateText`** en `common-ai/src/back.ts`, sustituyendo el re-export de la línea
   243. Antes de llamar comprueba el tope de llamadas; después de responder suma `usage` y comprueba el de
   tokens para la siguiente.
3. **La anotación del modelo**: `buildModel()` registra en un `WeakMap` el modelo que devuelve contra la
   huella de su clave efectiva. Sin esto el envoltorio no sabe contra qué clave contar.
4. **La excepción tipada**, distinguible de un fallo del modelo y con el motivo dentro: qué tope, qué
   ventana, cuánto queda.
5. **UI en el diálogo de IA del core**: tope por clave, con su unidad y sus dos ventanas, y el **consumo
   actual frente al tope**. Con el indicador de si los contadores son duraderos o volátiles.

### Lo que hay que vigilar

- 🔴 **El tope por tokens frena la llamada SIGUIENTE**, nunca la que se pasa: `usage` llega con la
  respuesta. La UI tiene que decirlo donde se configura, no en una nota al pie.
- 🔴 **La huella, nunca la clave.** Esa tabla no puede contener un secreto.
- ⚠️ `common-ai` corre **en el proceso del core** porque los plugins la mapean al global — pero su harness
  no. Los tests tienen que poder inyectar el servicio de uso sin levantar un core.
- ⚠️ Tocar `common-ai` obliga a **republicarla y subir la dependencia** donde haga falta, con el reinicio
  del front que eso arrastra.

---

## S2 · El tope por canal

Entrega: un administrador pone un tope a un **canal**, con las mismas unidades y ventanas, y los dos ejes
se aplican en **AND** — la llamada necesita presupuesto en los dos y el error dice cuál se agotó.

### Qué se construye

1. **`buildModel(llm, providers, consumerId?)`**, con el tercer parámetro opcional para que nada deje de
   compilar.
2. **Los ocho consumidores pasan su identidad**: agora, censor, excubitor, iter, montag, pinocchio, situs
   y el `generateVision` de la propia `common-ai`. Son ~20 sitios, una línea cada uno.
3. **UI del tope por canal** y el error que distingue qué eje cortó.

### El coste real de este stream

⚠️ **Ocho artefactos a publicar**, y **cinco son de pago** (agora, excubitor, iter, montag, situs): Nexus
privado y manifest privado, no npm público. Los otros tres (censor, pinocchio, y `common-ai`) van al
público, con su README en el tarball.

⚠️ **Hasta que un plugin se republique, sus llamadas no se atribuyen.** Como el PRD descarta el cajón de
«no atribuido», el tope por canal de ese plugin **no se aplica** hasta que su versión nueva esté instalada.
El eje por clave sí sigue aplicándose: S1 no depende de esto.

---

## Cambio de especificación (2026-10-26) — precios y límites por modelo

**No era un bug: la especificación estaba mal.** Los costes y los *Usage limits* solo se podían editar si
el modelo tenía **key propia**, con el argumento de que el proveedor factura la clave. Cierto, pero de ahí
no se sigue lo que estaba construido: dentro de **un mismo provider, y sobre una misma key**, cada modelo
cuesta distinto, así que el precio nunca fue una propiedad de la credencial.

Lo entregado:

- `ILlmProvider` gana `inputCostPerMillion` / `outputCostPerMillion`: **precios por defecto** de sus
  modelos, con su bloque *Default model costs* en el diálogo.
- Los costes del modelo pasan a ser **opcionales de verdad** (antes se forzaban a `0`, así que ningún
  default era alcanzable). Resolución **modelo → provider → 0**, con `??` y no `||`: un **0** escrito es un
  precio **dicho** —gratis, self-hosted— y no cae al del provider. El campo vacío enseña en el placeholder
  lo que va a heredar.
- Los **límites se editan siempre**, con o sin key prestada, y vacíos heredan los del provider
  (`effectiveLimits`). La clave es `statesSomething()`: un `IUsageLimits` **vaciado** por el formulario
  sigue existiendo, y tomarlo por «límites propios» convertía un formulario borrado en *sin tope*.
- 6 tests nuevos en `common-ai` (61 ✅) y 4 casos e2e en `ai-config-dialog-layout` (8 ✅).

⚠️ **El contador sigue siendo de la KEY** (`EUsageScope.LLM_KEY`). Con key prestada, un techo puesto en el
modelo se mide contra lo que han gastado **todos** los modelos que comparten esa key. Es la única forma de
cortar un modelo antes de que se agote el presupuesto común, pero no es un presupuesto suyo — y se dice en
el propio diálogo, no en la guía.

🔴 **Publicar `common-ai` NO obliga a republicar los plugins.** El `build.mjs` de los ocho la externaliza a
los globales que sirve el core (`window.__kwirth__.kwirthCommonAiFront` y
`global.__kwirth_back__.kwirthCommonAi`), así que el bundle **no la contiene**: comprobado en censor, tras
instalar 0.5.76 y rebuildear, `dist/front.js` y `dist/back.js` salen con el **mismo md5**. Quien entrega
estos cambios es el **core**. Subir la dependencia en cada plugin sí tiene función —el `tsc --noEmit` del
build valida los tipos nuevos, que es donde se habría visto si los costes ahora opcionales rompían a
alguien—, pero se queda en el fuente y viaja en el siguiente release de cada uno. Lo que **sí** obligará a
republicarlos es S2, porque ahí cambia el código de cada plugin.

## Lo que NO entra en ninguno de los dos

- **Tarifas que Kwirth conozca.** Los precios los pone el administrador (en el provider, en el modelo, o
  en los dos); Kwirth no mantiene ninguna tabla de precios ni la consulta a nadie.
- **Límites por usuario.** El consumidor sellado es `<tipo>:<id>`, no la persona.
- **Topes de flota.** Son de cada Kwirth por diseño (ver el PRD): quien quiera un techo global lo pone en
  la cuota del proveedor del LLM.
- **Reparto o colas al agotarse.** Se corta.

## Backlog

- **Un eje de gasto POR MODELO.** Desde el cambio del 2026-10-26 se puede poner un techo a un modelo que
  usa la key del provider, pero el contador que lo mide es el de la **key**: el gasto de todos los modelos
  que la comparten. Para que el techo signifique lo que parece prometer haría falta un `EUsageScope` nuevo
  con subject `<provider>::<llmId>`, que es tabla, migración y una decisión sobre qué pasa cuando conviven
  el tope de la key y el del modelo (lo coherente: corta el primero que se alcance, como ya hacen las
  unidades entre sí). Mientras tanto, el diálogo lo dice.
- 🔴 **Que el usuario se entere, en TODOS los canales.** El corte siempre ocurre y siempre queda en el log
  del core, pero lo que llega a la pantalla depende de cada canal: pinocchio, excubitor, montag, situs y
  censor tienen `catch` y lo muestran; **agora e iter no tenían ninguno**. Agora se arregló en S1 porque un
  chat mudo es indistinguible de un chat lento — contesta en la conversación cuando no hay cuota, y se
  calla (con traza) en las alertas proactivas, que es su convención. **`iter` sigue sin tocar**: no es un
  chat, así que hay que mirar qué hace con el resultado de `generateVision` antes de decidir si avisa o
  calla. Lo que cierra esto de verdad para todos es que **el core notifique él mismo** vía
  `channelObject.notify()`, y eso necesita el `consumerId` de S2.
- **El tope por canal no se aplica hasta republicar cada plugin** (S2): sin `consumerId` la llamada no se
  atribuye, y el PRD descarta el cajón de «no atribuido». El eje por clave sí funciona desde S1.
- **El logging de `logUsage` está mal por dos sitios** (`common-ai/src/back.ts:127`, `:261`, `:272`):

  ```
  [kwirth-common-ai] AI usage: the counters did not answer in 5000 ms — the call goes ahead and the LIMITS ARE NOT ENFORCED for it
  [kwirth-common-ai] AI usage: reading the counters took 5025 ms before the model was even called
  ```

  **(a) Un evento, dos líneas, y la segunda miente.** Cuando la carrera vence por el timeout salta la de
  `:261` y, como 5025 > 1000, salta también la de `:272`. Pero «reading the counters took 5025 ms» se lee
  como que la lectura terminó, y no terminó: se abandonó a los 5000. El aviso de lentitud solo tiene
  sentido cuando la lectura **respondió** — si ya hubo timeout, la línea sobra.

  **(b) El prefijo va a mano y por `console.warn`.** Es el mismo defecto que tenía `KubernetesTools` y que
  se corrigió el 2026-10-16: un mensaje con el prefijo escrito dentro no lo puede filtrar nadie, y además
  sale por stdout en crudo en vez de por el logging de Kwirth. El comentario de `:123` justifica el
  `console.warn` con que el módulo «no debe adquirir una dependencia de un logger para poder avisar de que
  está a ciegas», y eso **sigue siendo cierto**: la solución no es importar uno, es la misma de
  `KubernetesTools` — una interfaz inyectable con `console` de **default**, que el core sustituye en el
  arranque por su `componentLogger(ELogComponent.CORE, 'ai-usage')`. El módulo se queda sin dependencias y
  el mensaje se vuelve filtrable por id.

- ⏭ **Los dos tests de SQL se saltan** salvo que se apunte `KWIRTH_SQL_HOST` a una base. `common-sql` se
  configura en el arranque del core, así que desde el harness no hay servidor. Escriben en
  `core-ai-usage-test`, nunca en la base del core.
- ✅ **Hecho el 2026-10-06: la poda de filas diarias viejas.** Estaba anotado aquí como si fuera una
  decisión y no lo era — se quedó sin hacer al implementar la tabla, que es donde le tocaba. Las diarias
  se conservan **35 días** y el resto se podan al arrancar; las **mensuales no se podan nunca**, porque
  doce al año por sujeto no es nada y son el histórico que interesa. Lo que lo hace trivial es que el
  servicio **solo lee la fila de hoy y la del mes en curso**: una diaria más vieja no tiene función.
  La comparación es de cadenas y no de fechas, porque `YYYY-MM-DD` ordena alfabéticamente igual que
  ordena en el tiempo. Nunca iba a doler —200 sujetos son 754.000 filas en diez años— pero sin límite
  es sin límite.
