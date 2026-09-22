# Sender Debug — banco de pruebas de senders — PRD

> Estado: **VIVO** (2026-09-22). Documento de **producto**: qué problema resuelve y por qué así.
> El desglose en fases y streams va al [PLAN](./PLAN.md).
> Si algo de aquí contradice lo que ves en el producto, gana el producto.

## 1. El problema

Un sender es la puerta de salida de Kwirth: un aviso de Excubitor, una línea de log reenviada a
Elastic, un ticket de Jira. Y hoy **no hay forma de comprobar que esa puerta funciona** sin provocar
de verdad la condición que dispara el envío.

Quien configura un sender hoy tiene que:

1. Rellenar su configuración (un webhook de Teams, un SMTP, unas credenciales de Jira).
2. Montar el escenario que produce el aviso — una alerta real, un pod que casque, una regla que
   salte — y esperar.
3. Si no llega nada, ir a los logs del core a ver si hubo un error, porque el fallo **no sube a
   ninguna parte**.

Ese último punto no es una impresión: `SenderManager.send()`
([back/src/tools/SenderManager.ts:563](../../back/src/tools/SenderManager.ts#L563)) captura la
excepción del sender, escribe un `logError` y devuelve `undefined` — que es exactamente lo mismo que
devuelve un envío correcto de un sender de notificación pura. **Un sender roto y un sender que
funciona son indistinguibles para quien lo llama.**

A eso se suma que la ruta de **lote** (`sendBatch`, la que usan los destinos de log: Datadog,
Elastic, Loki, porque sus APIs aceptan arrays y cobran por petición) no tiene hoy **ningún** modo de
ejercitarse a mano. Solo se recorre cuando hay caudal de log de verdad.

## 2. Objetivo

**Poder elegir un sender y una de sus configuraciones, componer un mensaje a mano, enviarlo, y ver
qué contestó** — el resultado, o el error, con su texto.

Es el gemelo de [provider-debug](../provider-debug/PLAN.md) en el lado de salida: aquel enseña en
crudo lo que **entra** por un provider; este enseña qué pasa cuando algo **sale** por un sender.

### No objetivos

- **No es un validador de credenciales.** Eso ya lo hace el core: el formulario genérico de
  configuración de una extensión saca un botón **TEST** cuando la extensión expone `/test` en su
  `configRouter` (commit `1aeaf2f8`). Aquel responde *"estas credenciales valen"*; este responde
  *"este mensaje, con este contenido, llegó o no llegó, y esto contestó el destino"*. Son preguntas
  distintas y se responden en momentos distintos.
- **No sustituye a los e2e de cada sender.** Es una herramienta de mano, para quien está escribiendo
  o configurando un sender.
- **No toca el contrato `ISender`.** Todo lo que necesita ya está publicado.
- **No es para producción desatendida.** No programa envíos, no repite, no monitoriza.

## 3. Quién lo usa

| # | Perfil | Qué quiere |
|---|---|---|
| CU1 | Quien **escribe** un sender | Ver si su `send()` recibe el mensaje que espera y qué devuelve, sin montar el escenario que lo dispara |
| CU2 | Quien **configura** un sender ya escrito | Comprobar que el webhook de Teams de *esta* config entrega, antes de que haga falta de verdad |
| CU3 | Quien escribe un sender de **log** | Ejercitar `sendBatch()` con N mensajes — la ruta que hoy solo se recorre con caudal real |
| CU4 | Soporte | Reproducir *"no me llegan los avisos"* sin esperar al siguiente incidente |

## 4. Concepto

```
   +---------------------------+
   |  pestaña Sender Debug     |     el usuario elige y compone
   |  sender · config · mensaje|
   +-------------+-------------+
                 | COMMAND (websocket)
                 v
   +---------------------------+
   |  back del canal           |     resuelve el sender, llama y CAPTURA
   |  sender.send(cfg, msg)    |     lo que devuelve o lo que lanza
   +-------------+-------------+
                 | RESPONSE
                 v
   +---------------------------+
   |  historial de envíos      |     ✓ resultado  ·  ✗ error con su texto
   +---------------------------+
```

Lo que aporta frente a lo que ya hay: **el error deja de perderse**. El canal no llama por la vía
que lo traga, sino al sender directamente, y lo que salga —resultado, `void`, o excepción— sube a la
pantalla tal cual.

## 5. Requisitos

### Funcionales

| # | Requisito |
|---|---|
| RF1 | Listar los senders **instalados**, cada uno con sus configuraciones, y marcar cuáles están ya instanciados |
| RF2 | Elegir una configuración concreta de un sender concreto |
| RF3 | Componer un `ISenderMessage` completo: `subject`, `body`, `to`, `level`, `metadata`, `origin` |
| RF4 | Enviar y mostrar el resultado: entregado (con el `ISenderResult` si lo hay) o fallido (con el texto del error) |
| RF5 | Enviar un **lote** de N mensajes por `sendBatch()`, para ejercitar esa ruta |
| RF6 | Historial de envíos de la sesión, con su petición y su respuesta |

### No funcionales

| # | Requisito |
|---|---|
| RNF1 | **No arranca nada por estar instalado.** `requirements.providers` vacío, como provider-debug |
| RNF2 | Público y open source, `plugins/sender-debug`, publicado en npm y en el manifest público |
| RNF3 | Un sender que reviente —o que devuelva basura— no puede tumbar el canal ni el core |
| RNF4 | Cluster-scoped: un sender no cuelga de un pod |

## 6. Riesgos

| # | Riesgo | Cómo se trata |
|---|---|---|
| R1 | **Un envío de prueba es un envío REAL.** Un correo sale, un ticket se crea, un canal de Teams recibe | La pantalla lo dice antes de enviar, y el botón no se pulsa solo. Los **e2e tienen prohibido** recorrer SEND contra nada que salga a la red — regla del proyecto, no de este plugin |
| R2 | Enviar a un sender que aún no estaba instanciado lo **instancia y lo arranca** (`getSender()` es perezoso, [SenderManager.ts:463](../../back/src/tools/SenderManager.ts#L463)) | Es lo mismo que haría cualquier plugin al enviarle algo: no es un efecto colateral del depurador. Se marca en la lista quién está ya vivo y quién no |
| R3 | Un sender de tipo `filter` (regex, ratelimit, timed) no entrega: encadena | Se marcan en la lista. Ejercitar `evalFilter()` queda **fuera** de este PRD |
| R4 | El canal usa `clusterInfo.senders`, que no es contrato publicado | Mismo precedente que provider-debug con `clusterInfo.providers`. Se tipa localmente y se degrada a `backChannelObject.senders` si no estuviera (ver PLAN, decisión D2) |

## 7. Qué NO entra, y dónde queda anotado

`fetchStatus()` (consultar el estado de una entidad externa creada por un sender de ticketing),
`evalFilter()` y los senders de tipo `filter`, y la exportación del historial: al backlog del
[PLAN](./PLAN.md), no aquí.
