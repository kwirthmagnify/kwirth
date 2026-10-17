# Plan — File Manager comprueba SOBRE QUÉ actúa

> **Estado: sin empezar. Vulnerabilidad CONFIRMADA en dev el 2026-10-17** (ver §1.1). Hallazgo surgido
> al cerrar el gate de verbos (`fileman` 0.2.27): el verbo está resuelto y publicado; **el objetivo no**.

---

## 1. El agujero

Los cuatro endpoints HTTP de `fileman` (`download`, `upload`, `read`, `write`) y los cinco comandos que
mutan (`CREATE`, `RENAME`, `DELETE`, `MOVE`, `COPY`) sacan el destino **del parámetro que manda el
cliente** y lo usan sin contrastarlo con los `resources` de la clave:

```js
let [dstNamespace, dstPod, dstContainer] = filename.split('/').slice(1)
await this.uploadFile(dstNamespace, dstPod, dstContainer, tmpName, dstLocalPath)
```

**Alcance exacto, sin exagerar**: hace falta una accessKey válida **y** una instancia de File Manager
abierta (el `socket.find` lo exige), así que no es acceso anónimo — es escalada *dentro* de los usuarios
legítimos del canal. Pero un usuario con `fileman$write` **en un namespace puede escribir en cualquier
contenedor del clúster**, incluidos los que su clave no concede.

La cadena es corta y no hay comprobación intermedia: `processHttpChannelRequest` solo valida que la
clave sea **auténtica** (`getKey` es autenticación, no autorización) y `checkAkr`, el chequeo real, solo
se llama desde `addObject`.

## 1.1 Confirmado en dev (2026-10-17)

Ejecutado, no deducido. Una clave concedida **solo en el namespace `kwirth`**:

```
Authorization: Bearer <uuid>|permanent|fileman$user,fileman$read:kwirth:::
```

pidiendo un fichero de un pod de **`kwirth-system`**, namespace que esa clave **no concede**:

```
GET /<ri>/channel/fileman/read?key=<instanceId>
    &filename=/kwirth-system/kwirth-postgres-…/postgres/etc/group
```

**Devolvió el contenido del fichero.** No hubo 403 ni 400: la lectura se sirvió entera.

Un intento previo contra un namespace **inexistente** (`kwirth-fake`) ya lo había dejado ver: en vez de
403, respondió el error de la ejecución — o sea que **llegó a ejecutar `downloadFile`** contra un
namespace no concedido. La autorización no interviene en ningún punto del camino.

⚠️ **La escritura no se ha ejecutado, a propósito** (la prueba debía ser no destructiva), pero
`upload`/`write` y los cinco comandos que mutan derivan el destino **del mismo `filename` y con el mismo
código**, así que el alcance se presume idéntico mientras no se demuestre lo contrario.

💡 De paso: con el namespace inexistente la respuesta fue literalmente **`[object Object]`** —
`res.status(400).send(result.message)` manda el objeto sin convertirlo a texto, así que el usuario ve
eso en lugar del error real. Bug menor, se arregla con esto.

## 2. Por qué el gate de 0.2.27 no lo cubre

Son dos ejes distintos y los dos hacen falta:

| | pregunta | estado |
|---|---|---|
| **verbo** | ¿puede escribir? | ✅ `fileman` 0.2.27 |
| **objetivo** | ¿puede escribir **ahí**? | ❌ este plan |

## 3. Lo que hay que hacer

1. ~~Confirmarlo~~ ✅ **hecho** (§1.1).
2. **Un matcher compartido**, no copiado. `checkResource()` del core vive solo en el back, y los plugins
   tienen `parseResources` pero ningún comparador. Debe ir a **`common-back`** —
   `matchesResource(resource, { namespace, pod, container })` — porque `excubitor` y `trivy` tienen
   endpoints con la misma forma y van a necesitarlo. 🔴 **Un chequeo de seguridad copiado en tres
   plugins es un chequeo que diverge.**
3. **`fileman` lo usa** en los nueve sitios donde ya está el gate del verbo, con el destino que parsea
   del `filename`.
4. **Tests**: que un destino fuera de los `resources` dé 403 / mensaje, y —lo que más importa— que el
   test **no pase por vacuidad** (sin sesión abierta el endpoint responde 400 antes, así que hay que
   asegurar que llega al gate).

## 4. Decisiones pendientes

- **`groups`**: el core lo evalúa al **listar** (`getAllowedControllers`) y **no** al autorizar el
  objeto — `checkResource` tiene un `//+++` vacío donde iría. Si el matcher compartido refleja a
  `checkResource` tal cual, `fileman` arrastra el mismo hueco; si lo implementa, `fileman` queda **más
  estricto que el core** sin que nadie lo espere. Hay que elegir, y la decisión es del core, no de
  `fileman`.
- **`excubitor` y `trivy`**: misma forma, mismo riesgo, sin tocar. ¿Entran en este plan o en el suyo?

## 5. Relación con los thin scopes

Son cosas distintas y conviene no mezclarlas: [thin-scopes](../thin-scopes/PLAN.md) aporta el
**vocabulario** para decir *"solo en `/usr/app`"*, y este plan aporta la **comprobación** sin la cual
ese vocabulario no limita nada. 🔴 **Los thin scopes de `fileman` no deben publicarse antes que esto**,
o serían un permiso que se concede y no hace nada — el patrón que ya ha aparecido tres veces en este
producto.
