# Kwirth Status v2 — PRD

> Segunda versión de **Kwirth Status** ([PRD.md](PRD.md), [PLAN.md](PLAN.md), cerrado en
> `plugin/status@0.2.7`). Mismo producto y mismo nombre, más alcance: el contenido se organiza en cinco
> pestañas. Lo que allí se decidió sigue valiendo salvo donde este PRD lo cambie explícitamente.

## 1. Qué es

Un canal para el **administrador de Kwirth** que enseña a Kwirth por dentro: qué tiene montado, cómo está,
quién consume a quién, cuánto mueve y cuánto le cuesta al proceso. Es el sitio al que se va cuando la
pregunta es *"¿qué le pasa a Kwirth?"*, no *"¿qué le pasa a mi cluster?"*.

No es para quien desarrolla extensiones: eso sigue siendo **provider-debug**.

## 2. Por qué el cambio

- **Le falta la mitad de Kwirth.** Hoy enseña providers, pluviders, senders y webhooks porque es lo único
  que el core le pasa. Plugins, themes, homepages, logins, idps, aitoolsets, docs y packs no aparecen.
- **No dice nada del propio proceso.** Si Kwirth va lento o crece en memoria, esta pantalla no lo cuenta.

## 3. Requisitos

### RF1 — ~~El rename a `kwirth`~~ · DESCARTADO

Se planteó llamar al canal `kwirth` y se descartó el mismo día: un canal que se llama como el producto es un
lío de nombres. Se queda **`status`**, con todo lo demás de este PRD.

### RF2 — Pestañas

El contenido pasa de un conmutador tabla/grafo a **pestañas**, en este orden:

| # | pestaña | qué enseña |
|---|---|---|
| 1 | **Providers** | la tabla actual, **solo providers y pluviders**: estado, *Why*, consumidores, entregas |
| 2 | **Graph** | el grafo actual, en capas (quién consume a quién) |
| 3 | **Performance** | el rendimiento del **proceso** de Kwirth |
| 4 | **Plugins** | los plugins instalados y lo que tienen vivo |
| 5 | **Extensions** | el resto de extensiones: senders, webhooks, themes, homepages, logins, idps, aitoolsets, docs, packs |

Senders y webhooks **salen de la pestaña 1** y pasan a la 5: la 1 (y su grafo, la 2) es producción de datos;
la 5, extensiones que no producen.

El refresco (manual o auto) y la hora de la foto son **comunes** a todas las pestañas: una foto es una foto
de todo Kwirth.

### RF3 — Performance: el proceso, con su serie

Del proceso del core, que es donde corre el back del canal: memoria (**RSS** y **heap** usado/total), **CPU**
(% entre dos fotos, usuario y sistema), **retraso del event loop**, **uptime**, versión de Node y de Kwirth.

- Una **serie** con las fotos tomadas **mientras la pestaña está abierta**, en memoria del front, pintada en
  minigráficas. Se pierde al cerrar: no es una serie temporal persistente y no se guarda en ninguna parte.
- Sin muestreo en segundo plano: cada punto es una foto que pidió alguien que estaba mirando. **Coste cero
  con el canal cerrado** — el requisito que manda en este plugin (RNF1 de status) no cambia.
- La CPU % sale de la diferencia entre dos fotos; con una sola, se dice que no se sabe, no se pinta un 0.

### RF4 — Plugins

Por plugin: id, versión, estado (cargado · fallido · pendiente de reinicio), los **canales** que registra y,
por canal, **instancias y conexiones vivas**. Responde a *"¿esto lo está usando alguien ahora?"*.

### RF5 — Extensions

Por extensión, de cada uno de los nueve tipos: id, versión, estado y lo que ese tipo tenga de configuración
(nº de configs de un sender o un webhook, si un login o un theme es el activo…). Sin secretos ni URLs con
token: la regla de status para webhooks (`getUrl()` lleva el token dentro) se extiende a todo.

### RF6 — El core expone lo que falta, en solo lectura

Plugins y los tipos de extensión que hoy no llegan al canal se exponen en `clusterInfo` **en solo lectura**,
como ya se hace con `senders` y `webhooks`. Status lo lee de forma **opcional**: con un core anterior, la
pestaña dice que ese dato no está disponible en vez de romperse.

## 4. Lo que no hace

- Serie temporal persistente, alertas o históricos (RF3 es de sesión, a propósito).
- CPU o memoria **por extensión**: todo corre en el mismo proceso de Node y atribuirlo sería inventarlo.
- Tocar nada: el canal sigue siendo de solo lectura.
- Federación multicluster.

## 5. Decisiones del usuario (2026-09-28)

- ~~Rename a `kwirth`~~: planteado y **descartado** el mismo día — el canal sigue siendo `status`.
- Tocar el core para exponer plugins y extensiones en solo lectura.
- Pestaña 1 solo con providers y pluviders; senders y webhooks a la 5.
- Performance con serie mientras la pestaña está abierta.
- ~~Quitar las entradas de `status` del manifest~~: sin rename, no aplica.
