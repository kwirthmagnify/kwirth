# Control de uso de los servicios de IA — PLAN

> **Estado: S1 ENTREGADO el 2026-10-06**, QA validado (A y B). Queda **S2**, el tope por canal.
> PRD: [PRD.md](PRD.md).

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

## Lo que NO entra en ninguno de los dos

- **Coste en dinero.** Kwirth no conoce las tarifas y no va a mantener una tabla de precios.
- **Límites por usuario.** El consumidor sellado es `<tipo>:<id>`, no la persona.
- **Topes de flota.** Son de cada Kwirth por diseño (ver el PRD): quien quiera un techo global lo pone en
  la cuota del proveedor del LLM.
- **Reparto o colas al agotarse.** Se corta.

## Backlog

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
